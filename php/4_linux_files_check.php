<?php
//4_linux_files_check.php
declare(strict_types=1);
set_time_limit(60);
ini_set('display_errors', '0');
error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

interface FileValidatorInterface
{
    public function validate(array &$result): void;
}

final class JsonValidator implements FileValidatorInterface
{
    public function validate(array &$result): void
    {
        $result['правильный'] = false;

        if (!$result['существует'] || !$result['является_файлом'] || !$result['чтение']) {
            return;
        }

        try {
            $content = file_get_contents($result['полный_путь']);
            if ($content === false) {
                throw new RuntimeException('Не удалось прочитать файл');
            }

            json_decode($content);
            $result['правильный'] = (json_last_error() === JSON_ERROR_NONE);
        } catch (RuntimeException $e) {
            $result['правильный'] = false;
        }
    }
}

final class HostsReader implements FileValidatorInterface
{
    public function validate(array &$result): void
    {
        $result['домены'] = [];

        if (!$result['существует'] || !$result['является_файлом'] || !$result['чтение']) {
            return;
        }

        try {
            $lines = file($result['полный_путь'], FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if ($lines === false) {
                throw new RuntimeException('Не удалось прочитать файл');
            }

            foreach ($lines as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#')) {
                    continue;
                }
                if (preg_match('/^[a-z0-9\.\-]+$/i', $line)) {
                    $result['домены'][] = $line;
                }
            }
        } catch (RuntimeException $e) {
            $result['домены'] = [];
        }
    }
}

final class FileChecker
{
    private string $basePath;

    public function __construct(string $basePath)
    {
        $this->basePath = rtrim($basePath, DIRECTORY_SEPARATOR);
    }

    public function checkFile(string $relativePath, array $options = []): array
    {
        $path = $this->basePath . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);

        $result = [
            'название_файла' => basename($relativePath),
            'полный_путь' => $path,
            'существует' => file_exists($path),
        ];

        if ($result['существует']) {
            $result['является_файлом'] = is_file($path);
            $result['чтение'] = is_readable($path);

            if ($result['является_файлом'] && !$result['чтение']) {
                @chmod($path, 0644);
                $result['чтение'] = is_readable($path);
            }

            if ($options['проверка_записи'] ?? false) {
                $result['запись'] = is_writable($path);
                if ($result['является_файлом'] && !$result['запись']) {
                    @chmod($path, 0664);
                    $result['запись'] = is_writable($path);
                }
            }
        } else {
            $result['является_файлом'] = false;
            $result['чтение'] = false;
            if ($options['проверка_записи'] ?? false) {
                $result['запись'] = false;
            }
        }

        $validators = [
            'json_valid' => new JsonValidator(),
            'read_hosts' => new HostsReader(),
        ];

        foreach ($options['дополнительные_проверки'] ?? [] as $check) {
            if (isset($validators[$check])) {
                $validators[$check]->validate($result);
            }
        }

        return $result;
    }
}

final class FileCheckService
{
    private FileChecker $checker;

    public function __construct(FileChecker $checker)
    {
        $this->checker = $checker;
    }

    public function runChecks(): array
    {
        $config = [
            'файл_ciadpi' => [
                'путь' => implode(DIRECTORY_SEPARATOR, ['byedpi', 'ciadpi']),
                'опции' => [],
            ],
            'файл_конфигурации' => [
                'путь' => 'config.json',
                'опции' => [
                    'проверка_записи' => true,
                    'дополнительные_проверки' => ['json_valid'],
                ],
            ],
            'файл_pac' => [
                'путь' => 'local.pac',
                'опции' => [
                    'проверка_записи' => true,
                ],
            ],
            'файл_управления_системой' => [
                'путь' => implode(DIRECTORY_SEPARATOR, ['php', '12_linux.php']),
                'опции' => [],
            ],
        ];

        for ($i = 1; $i <= 8; $i++) {
            $config["файл_хост_листа_ciadpi_для_использования_{$i}"] = [
                'путь' => implode(DIRECTORY_SEPARATOR, ['byedpi', "main_server_{$i}_hosts.txt"]),
                'опции' => [
                    'проверка_записи' => true,
                    'дополнительные_проверки' => ['read_hosts'],
                ],
            ];
        }

        $results = [];
        foreach ($config as $key => $item) {
            try {
                $results[$key] = $this->checker->checkFile($item['путь'], $item['опции']);
            } catch (Throwable $e) {
                $results[$key] = [
                    'результат' => false,
                    'сообщение' => $e->getMessage()
                ];
            }
        }

        return $results;
    }
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        throw new RuntimeException('Метод запроса должен быть GET');
    }

    $basePath = dirname(__DIR__);
    
    $checker = new FileChecker($basePath);
    $service = new FileCheckService($checker);

    $results = $service->runChecks();
    http_response_code(200);
    echo json_encode(
        [
            'результат' => true,
            'файлы' => $results
        ],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(
        [
            'результат' => false,
            'сообщение' => $e->getMessage(),
        ],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
}