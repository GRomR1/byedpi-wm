<?php
//7_detect_other_ggc_domains.php
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

final class PortCheckerService
{
    private const API_URL = 'https://portchecker.io/api/query';
    private const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

    public function checkPorts(string $host, array $ports): array
    {
        $postData = json_encode([
            'host' => $host,
            'ports' => $ports
        ]);

        $ch = curl_init(self::API_URL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json, text/plain, */*',
                'Accept-Language: ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
                'Content-Type: application/json',
                'Origin: https://portchecker.io',
            ],
            CURLOPT_POSTFIELDS => $postData,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => self::USER_AGENT,
            CURLOPT_REFERER => 'https://portchecker.io/',
            CURLOPT_ENCODING => 'gzip, deflate',
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            throw new RuntimeException("Ошибка сети: $error");
        }

        if ($httpCode !== 200) {
            return ['результат' => false, 'сервер_ggc' => ''];
        }

        $data = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException("Ошибка формата ответа: " . json_last_error_msg());
        }

        $serverGGC = $data['host'] ?? '';
        $isAccessible = false;
        if (isset($data['check']) && is_array($data['check'])) {
            foreach ($data['check'] as $portCheck) {
                if (isset($portCheck['status']) && $portCheck['status'] === true) {
                    $isAccessible = true;
                    break;
                }
            }
        }

        return [
            'результат' => $isAccessible,
            'сервер_ggc' => $isAccessible ? $serverGGC : ''
        ];
    }
}

final class RequestValidator
{
    public function validate(): array
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            throw new RuntimeException('Метод запроса должен быть POST', 405);
        }

        $json = file_get_contents('php://input');
        if ($json === false || $json === '') {
            throw new RuntimeException('Пустое тело запроса', 400);
        }

        $data = json_decode($json, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException('Неверный формат JSON: ' . json_last_error_msg(), 400);
        }

        if (empty($data['host'])) {
            throw new RuntimeException('Обязательное поле "host" отсутствует', 400);
        }

        $ports = $data['ports'] ?? [443];
        if (!is_array($ports)) {
            throw new RuntimeException('Поле "ports" должно быть массивом', 400);
        }

        return [
            'host' => $data['host'],
            'ports' => $ports,
        ];
    }
}

try {
    $validator = new RequestValidator();
    $requestData = $validator->validate();

    $service = new PortCheckerService();
    $result = $service->checkPorts($requestData['host'], $requestData['ports']);

    http_response_code(200);
    echo json_encode(
        $result,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
} catch (Throwable $e) {
    $statusCode = $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 500;
    http_response_code($statusCode);
    echo json_encode([
        'результат' => false,
        'сервер_ggc' => '',
        'сообщение' => $e->getMessage(),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}