<?php
//8_update_pac.php
declare(strict_types=1);
set_time_limit(60);
ini_set('display_errors', '0');
error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

final class RequestValidator
{
    public function validate(): array
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            throw new InvalidArgumentException('Метод запроса должен быть POST');
        }

        $json = file_get_contents('php://input');
        if ($json === false || $json === '') {
            throw new RuntimeException('Ошибка чтения тела запроса');
        }

        $data = json_decode($json, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException('Неверный формат JSON: ' . json_last_error_msg());
        }

        if (!isset($data['ciadpi_для_использования']) || !is_array($data['ciadpi_для_использования'])) {
            throw new InvalidArgumentException('Отсутствует или неверный ключ "ciadpi_для_использования"');
        }

        return $data['ciadpi_для_использования'];
    }

    public function validateStructure(array $data): void
    {
        if (count($data) !== 8) {
            throw new InvalidArgumentException('Должно быть ровно 8 процессов');
        }

        $expectedKeys = array_map(fn($i) => "процесс_$i", range(1, 8));
        foreach ($expectedKeys as $key) {
            if (!isset($data[$key]) || !is_array($data[$key])) {
                throw new InvalidArgumentException("Отсутствует или неверный процесс: $key");
            }
            $process = $data[$key];
            if (!isset($process['ip_для_сайта_и_pac_файла']) || !filter_var($process['ip_для_сайта_и_pac_файла'], FILTER_VALIDATE_IP)) {
                throw new InvalidArgumentException("Некорректный IP в процессе $key");
            }
            if (!isset($process['tcp_порт']) || !is_int($process['tcp_порт']) || $process['tcp_порт'] < 1 || $process['tcp_порт'] > 65535) {
                throw new InvalidArgumentException("Некорректный порт в процессе $key");
            }
        }
    }
}

final class PacUpdater
{
    public function update(string $filename, array $serversConfig): void
    {
        if (!file_exists($filename) || !is_readable($filename) || !is_writable($filename)) {
            throw new RuntimeException("Недоступен файл '$filename'");
        }

        $content = file_get_contents($filename);
        if ($content === false) {
            throw new RuntimeException('Не удалось прочитать файл');
        }

        $pattern = '/const servers = (\[[\s\S]*?\]);/';
        if (!preg_match($pattern, $content, $matches) || !isset($matches[1])) {
            throw new RuntimeException('Массив серверов не найден в PAC-файле');
        }

        $servers = json_decode($matches[1], true);
        if (json_last_error() !== JSON_ERROR_NONE || count($servers) !== 8) {
            throw new RuntimeException('Неверный формат или количество серверов');
        }

        for ($i = 0; $i < 8; $i++) {
            $key = "main_" . ($i + 1) . "_server";
            if (!isset($serversConfig[$key])) {
                throw new RuntimeException("Отсутствует конфигурация для $key");
            }
            $servers[$i]['ip'] = $serversConfig[$key]['ip'];
            $servers[$i]['port'] = $serversConfig[$key]['port'];
        }

        $updatedJson = json_encode($servers, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $newContent = preg_replace($pattern, "const servers = $updatedJson;", $content);
        
        if ($newContent === null) {
            throw new RuntimeException('Ошибка при замене контента PAC-файла');
        }
        
        if (file_put_contents($filename, $newContent, LOCK_EX) === false) {
            throw new RuntimeException('Не удалось обновить PAC-файл');
        }
    }
}

try {
    $validator = new RequestValidator();
    $data = $validator->validate();
    $validator->validateStructure($data);

    $serversConfig = [];
    for ($i = 1; $i <= 8; $i++) {
        $key = "процесс_$i";
        $serversConfig["main_{$i}_server"] = [
            'ip' => $data[$key]['ip_для_сайта_и_pac_файла'],
            'port' => $data[$key]['tcp_порт'],
        ];
    }

    $updater = new PacUpdater();
    $pacFileX = __DIR__ . '/../local.pac';
        $updater->update($pacFileX, $serversConfig);

    http_response_code(200);
    echo json_encode(
        [
            'результат' => true,
            'обновление_pac_файла' => 'PAC-файл успешно обновлен',
        ],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
} catch (Throwable $e) {
    http_response_code($e instanceof InvalidArgumentException ? 400 : 500);
    echo json_encode(
        [
            'результат' => false,
            'сообщение' => $e->getMessage(),
        ],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
}