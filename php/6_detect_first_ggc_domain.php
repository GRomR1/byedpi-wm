<?php
//6_detect_first_ggc_domain.php
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

final class GgcDetector
{
    private const SOURCE_URLS = [
        'https://redirector.gvt1.com/report_mapping?di=no',
        'http://redirector.c.googlevideo.com/report_mapping?di=no',
    ];

    private const CHAR_DECODER = [
        'u' => '0', 'z' => '1', 'p' => '2', 'k' => '3', 'f' => '4', 'a' => '5',
        '5' => '6', '0' => '7', 'v' => '8', 'q' => '9', 'l' => 'a', 'g' => 'b',
        'b' => 'c', '6' => 'd', '1' => 'e', 'w' => 'f', 'r' => 'g', 'm' => 'h',
        'h' => 'i', 'c' => 'j', '7' => 'k', '2' => 'l', 'x' => 'm', 's' => 'n',
        'n' => 'o', 'i' => 'p', 'd' => 'q', '8' => 'r', '3' => 's', 'y' => 't',
        't' => 'u', 'o' => 'v', 'j' => 'w', 'e' => 'x', '9' => 'y', '4' => 'z',
        '-' => '-',
    ];

    private const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    private const RESPONSE_PATTERN = '/=>\s*([a-z0-9\-]+)\b/';
    private const GGC_DOMAIN_TEMPLATE = 'https://rr1---sn-%s.googlevideo.com';
    private const MAX_ATTEMPTS = 2;

    public function detect(): string
    {
        $ch = curl_init();
        if ($ch === false) {
            throw new RuntimeException('Не удалось инициализировать CURL');
        }

        $lastError = null;
        try {
            foreach (self::SOURCE_URLS as $url) {
                $isHttps = strpos($url, 'https://') === 0;
                
                curl_setopt_array($ch, [
                    CURLOPT_URL => $url,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT => 5,
                    CURLOPT_CONNECTTIMEOUT => 3,
                    CURLOPT_FOLLOWLOCATION => true,
                    CURLOPT_USERAGENT => self::USER_AGENT,
                    CURLOPT_FAILONERROR => true,
                    CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
                    CURLOPT_SSL_VERIFYPEER => $isHttps,
                    CURLOPT_SSL_VERIFYHOST => $isHttps ? 2 : 0,
                ]);

                for ($attempt = 1; $attempt <= self::MAX_ATTEMPTS; $attempt++) {
                    $response = curl_exec($ch);

                    if ($response === false) {
                        $lastError = 'Ошибка CURL: ' . curl_error($ch);
                        if ($attempt < self::MAX_ATTEMPTS) {
                            sleep(1);
                        }
                        continue;
                    }

                    if (empty($response)) {
                        $lastError = 'Получен пустой ответ от сервера Google';
                        if ($attempt < self::MAX_ATTEMPTS) {
                            sleep(1);
                        }
                        continue;
                    }

                    if (preg_match(self::RESPONSE_PATTERN, $response, $matches)) {
                        $prefix = trim($matches[1], '.: ');
                        $converted = $this->decodePrefix($prefix);
                        
                        if ($converted === null) {
                            $lastError = 'Ошибка декодирования префикса: ' . $prefix;
                            continue;
                        }
                        
                        return sprintf(self::GGC_DOMAIN_TEMPLATE, $converted);
                    }
                    
                    $lastError = 'Не удалось найти префикс в ответе';
                    if ($attempt < self::MAX_ATTEMPTS) {
                        sleep(1);
                    }
                }
            }
            
            throw new RuntimeException($lastError ?? 'Все источники недоступны');
        } finally {
            curl_close($ch);
        }
    }

    private function decodePrefix(string $prefix): ?string
    {
        $decoded = '';
        for ($i = 0; $i < strlen($prefix); $i++) {
            $char = $prefix[$i];
            if (!isset(self::CHAR_DECODER[$char])) {
                return null;
            }
            $decoded .= self::CHAR_DECODER[$char];
        }
        return $decoded;
    }
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        throw new RuntimeException('Метод запроса должен быть GET', 405);
    }

    $detector = new GgcDetector();
    $domain = $detector->detect();

    http_response_code(200);
    echo json_encode(
        [
            'результат' => true,
            'первый_сервер_ggc' => $domain,
        ],		
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
} catch (Throwable $e) {
    $statusCode = $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 500;
    http_response_code($statusCode);
    echo json_encode(
        [
            'результат' => false,
            'сообщение' => $e->getMessage(),
        ],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
}