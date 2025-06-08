<?php
//10_save_domains.php
declare(strict_types=1);
set_time_limit(60);
ini_set('display_errors', '0');
error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    header('Content-Length: 0');
    exit;
}

final class RequestValidator
{
    private const PROCESS_PATTERN = '/^процесс_(\d+)$/';
    private const DOMAIN_PATTERN = '/^([a-z0-9\-]+\.)+[a-z0-9\-]{2,}$/i';
    private const MIN_PROCESS = 1;
    private const MAX_PROCESS = 8;

    public function validate(): array
    {
        $this->validateMethod();
        $json = $this->getRequestBody();
        $data = $this->parseJson($json);
        $this->validateStructure($data);
        
        return $this->extractProcessData($data);
    }

    private function validateMethod(): void
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            throw new RuntimeException('Метод запроса должен быть POST', 405);
        }
    }

    private function getRequestBody(): string
    {
        $json = file_get_contents('php://input');
        if ($json === false || trim($json) === '') {
            throw new RuntimeException('Пустое тело запроса', 400);
        }
        return $json;
    }

    private function parseJson(string $json): array
    {
        try {
            return json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw new RuntimeException('Неверный формат JSON: ' . $e->getMessage(), 400);
        }
    }

    private function validateStructure(array $data): void
    {
        if (!isset($data['ciadpi_для_использования']) || 
            count($data['ciadpi_для_использования']) !== 1) {
            throw new RuntimeException('Должен быть указан ровно один процесс', 400);
        }
    }

    private function extractProcessData(array $data): array
    {
        $processName = key($data['ciadpi_для_использования']);
        $processData = reset($data['ciadpi_для_использования']);
        $domains = $processData['домены'] ?? [];
        
        if (!is_array($domains)) {
            throw new RuntimeException('Поле "домены" должно быть массивом', 400);
        }

        $this->validateProcessName($processName);
        $cleanedDomains = $this->validateAndCleanDomains($domains);

        return [
            'processNum' => $this->extractProcessNumber($processName),
            'domains' => $cleanedDomains,
        ];
    }

    private function validateProcessName(string $processName): void
    {
        if (!preg_match(self::PROCESS_PATTERN, $processName)) {
            throw new RuntimeException('Неверный формат имени процесса', 400);
        }
    }

    private function extractProcessNumber(string $processName): int
    {
        preg_match(self::PROCESS_PATTERN, $processName, $matches);
        $num = (int)($matches[1] ?? 0);
        
        if ($num < self::MIN_PROCESS || $num > self::MAX_PROCESS) {
            throw new RuntimeException(
                "Номер процесса вне диапазона (" . self::MIN_PROCESS . "-" . self::MAX_PROCESS . "): $num",
                400
            );
        }
        
        return $num;
    }

    private function validateAndCleanDomains(array $domains): array
    {
        if (empty($domains)) {
            return [];
        }

        $cleaned = [];
        foreach ($domains as $domain) {
            if (!is_string($domain)) {
                throw new RuntimeException('Домен должен быть строкой', 400);
            }
            
            $cleanDomain = trim($domain);
            if ($cleanDomain === '') {
                throw new RuntimeException('Домен не может быть пустым', 400);
            }
            
            if (!preg_match(self::DOMAIN_PATTERN, $cleanDomain)) {
                throw new RuntimeException("Некорректный формат домена: $cleanDomain", 400);
            }
            
            $cleaned[] = $cleanDomain;
        }
        
        return array_unique($cleaned);
    }
}

final class FileUpdater
{
    private const PAC_PATTERN = '/const servers = (\[[\s\S]*?\]);/';
    private const HOSTS_DIR = 'byedpi';
    private const FILE_PERMISSIONS = 0755;

    public function updatePac(int $processNum, array $domains): void
    {
        $pacFile = $this->getPacFilePath();
        $content = $this->readPacFile($pacFile);
        $servers = $this->extractServers($content);
        $this->updateServerDomains($servers, $processNum, $domains);
        $this->writePacFile($pacFile, $content, $servers);
    }

    private function getPacFilePath(): string
    {
        return __DIR__ . '/../local.pac';
    }

    private function readPacFile(string $pacFile): string
    {
        if (!file_exists($pacFile)) {
            throw new RuntimeException('Файл local.pac не найден', 500);
        }
        
        if (!is_readable($pacFile) || !is_writable($pacFile)) {
            throw new RuntimeException('Отказано в доступе к файлу local.pac', 500);
        }
        
        $content = file_get_contents($pacFile);
        if ($content === false) {
            throw new RuntimeException('Не удалось прочитать local.pac', 500);
        }
        
        return $content;
    }

    private function extractServers(string $content): array
    {
        if (!preg_match(self::PAC_PATTERN, $content, $matches)) {
            throw new RuntimeException('Массив серверов в local.pac не найден', 500);
        }
        
        try {
            return json_decode($matches[1], true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw new RuntimeException('Ошибка формата PAC-файла: ' . $e->getMessage(), 500);
        }
    }

    private function updateServerDomains(array &$servers, int $processNum, array $domains): void
    {
        $serverIndex = $processNum - 1;
        if (!isset($servers[$serverIndex])) {
            throw new RuntimeException("Индекс сервера не найден: $serverIndex", 500);
        }
        
        $servers[$serverIndex]['domains'] = $domains;
    }

    private function writePacFile(string $pacFile, string $content, array $servers): void
    {
        $newJson = json_encode(
            $servers, 
            JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        );
        
        $newContent = preg_replace(
            self::PAC_PATTERN, 
            'const servers = ' . $newJson . ';', 
            $content
        );
        
        if ($newContent === null) {
            throw new RuntimeException('Ошибка обработки PAC-файла', 500);
        }
        
        if (file_put_contents($pacFile, $newContent, LOCK_EX) === false) {
            throw new RuntimeException('Не удалось записать в local.pac', 500);
        }
    }

    public function updateHosts(int $processNum, array $domains): void
    {
        $hostsFile = $this->getHostsFilePath($processNum);
        $this->writeHostsFile($hostsFile, $domains);
    }

    private function getHostsFilePath(int $processNum): string
    {
        return __DIR__ . "/../byedpi/main_server_{$processNum}_hosts.txt";
    }

    private function writeHostsFile(string $hostsFile, array $domains): void
    {
        $content = implode("\n", $domains);
        if (file_put_contents($hostsFile, $content, LOCK_EX) === false) {
            throw new RuntimeException('Не удалось записать файл hosts', 500);
        }
    }
}

final class RequestHandler
{
    public function handle(): void
    {
        try {
            $validator = new RequestValidator();
            $result = $validator->validate();

            $updater = new FileUpdater();
            $updater->updatePac($result['processNum'], $result['domains']);
            $updater->updateHosts($result['processNum'], $result['domains']);

            $this->sendSuccessResponse();
        } catch (Throwable $e) {
            $this->sendErrorResponse($e);
        }
    }

    private function sendSuccessResponse(): void
    {
        http_response_code(200);
        echo json_encode(
            [
                'результат' => true,
                'сообщение' => 'Домены успешно обновлены',
            ],
            JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        );
    }

    private function sendErrorResponse(Throwable $e): void
    {
        $code = $e->getCode() ?: 500;
        http_response_code($code);
        
        echo json_encode(
        [
            'результат' => false,
            'сообщение' => $e->getMessage(),
        ],
            JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        );
    }
}

(new RequestHandler())->handle();