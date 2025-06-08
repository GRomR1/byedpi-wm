<?php
//5_read_config.php
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

// Include config adapter
require_once __DIR__ . '/../config_adapter.php';

final class ConfigReader
{
    private const REQUIRED_SECTIONS = [
        'ciadpi_для_использования',
        'ciadpi_для_проверки_стратегий',
        'ссылки_по_умолчанию_для_проверки',
    ];

    private const PORT_RANGE = [1, 65535];
    private const USING_PROCESS_COUNT = 8;
    private const TESTING_PROCESS_COUNT = 24;

    public function readConfig(string $filePath): array
    {
        // Use ConfigAdapter to handle both old and new formats
        $config = ConfigAdapter::loadConfig($filePath);
        if ($config === null) {
            throw new RuntimeException('Файл конфигурации config.json не найден или содержит ошибки');
        }

        // Convert to new format for validation
        $newFormatConfig = ConfigAdapter::oldToNew($config);
        
        // Validate the new format
        $this->validateConfigStructure($newFormatConfig);

        // Return the new format config
        return $newFormatConfig;
    }

    private function validateConfigStructure(array $config): void
    {
        $requiredSections = [
            'ciadpi_для_использования',
            'ciadpi_для_проверки_стратегий',
            'ссылки_по_умолчанию_для_проверки',
        ];

        foreach ($requiredSections as $section) {
            if (!isset($config[$section])) {
                throw new RuntimeException("Отсутствует обязательная секция: $section");
            }
        }

        $this->validateUsingSection($config['ciadpi_для_использования']);
        $this->validateTestingSection($config['ciadpi_для_проверки_стратегий']);
        $this->validateLinksSection($config['ссылки_по_умолчанию_для_проверки']);
    }

    private function validateUsingSection(array $section): void
    {
        $processCount = count(array_filter(
            array_keys($section),
            fn($key) => str_starts_with($key, 'процесс_')
        ));

        if ($processCount !== self::USING_PROCESS_COUNT) {
            throw new RuntimeException(
                'Секция для использования должна содержать ровно ' . self::USING_PROCESS_COUNT . ' процессов'
            );
        }

        for ($i = 1; $i <= self::USING_PROCESS_COUNT; $i++) {
            $key = "процесс_$i";
            if (!isset($section[$key])) {
                throw new RuntimeException("Отсутствует процесс в секции использования: $key");
            }

            $process = $section[$key];
            $this->validateIP($process['ip_для_запуска'] ?? null, "ciadpi_для_использования: $key");
            $this->validateIP($process['ip_для_сайта_и_pac_файла'] ?? null, "ciadpi_для_использования: $key");
            $this->validatePort($process['tcp_порт'] ?? null, "ciadpi_для_использования: $key");
        }
    }

    private function validateTestingSection(array $section): void
    {
        $this->validateIP($section['ip_для_запуска'] ?? null, 'ciadpi_для_проверки_стратегий: корневой_ip_для_запуска');

        $processCount = count(array_filter(
            array_keys($section),
            fn($key) => str_starts_with($key, 'процесс_')
        ));

        if ($processCount !== self::TESTING_PROCESS_COUNT) {
            throw new RuntimeException(
                'Секция для тестирования должна содержать ровно ' . self::TESTING_PROCESS_COUNT . ' процессов'
            );
        }

        for ($i = 1; $i <= self::TESTING_PROCESS_COUNT; $i++) {
            $key = "процесс_$i";
            if (!isset($section[$key])) {
                throw new RuntimeException("Отсутствует процесс в секции тестирования: $key");
            }
            $this->validatePort($section[$key]['tcp_порт'] ?? null, "ciadpi_для_проверки_стратегий: $key");
        }
    }

    private function validateLinksSection(array $section): void
    {
        foreach ($section as $category => $urls) {
            if (!is_string($category) || !is_array($urls)) {
                throw new RuntimeException("Некорректная структура категории '$category'");
            }
            foreach ($urls as $url) {
                if (!is_string($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
                    throw new RuntimeException("Некорректный URL в категории '$category': $url");
                }
            }
        }
    }

    private function validateIP(?string $ip, string $context): void
    {
        if ($ip === null) {
            throw new RuntimeException("Отсутствует IP в $context");
        }
        if (!filter_var($ip, FILTER_VALIDATE_IP)) {
            throw new RuntimeException("Некорректный IP в $context: $ip");
        }
    }

    private function validatePort(?int $port, string $context): void
    {
        if ($port === null) {
            throw new RuntimeException("Отсутствует tcp_порт в $context");
        }
        if ($port < self::PORT_RANGE[0] || $port > self::PORT_RANGE[1]) {
            throw new RuntimeException("Порт $context вне диапазона (" . self::PORT_RANGE[0] . '-' . self::PORT_RANGE[1] . ')');
        }
    }
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        throw new RuntimeException('Метод запроса должен быть GET');
    }

    $configFile = __DIR__ . '/../config.json';
    $reader = new ConfigReader();
    $config = $reader->readConfig($configFile);

    http_response_code(200);
    echo json_encode(
        [
            'результат' => true,
            'конфигурация' => $config
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