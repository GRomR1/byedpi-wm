<?php
set_time_limit(60);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Cache-Control: no-store, no-cache, must-revalidate");
header("Pragma: no-cache");
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    header('Content-Length: 0');
    exit();
}

class DomainValidator {
    public static function isValid(string $domain): bool {
        $length = strlen($domain);
        if ($length < 4 || $length > 253) return false;
        
        if ($domain[0] === '.' || $domain[$length - 1] === '.') {
            return false;
        }
        
        if (strpos($domain, '.') === false) {
            return false;
        }
        
        for ($i = 0; $i < $length; $i++) {
            $char = $domain[$i];
            if (!(($char >= 'a' && $char <= 'z') || 
                 ($char >= '0' && $char <= '9') || 
                 $char === '.' || 
                 $char === '-')) {
                return false;
            }
        }
        return true;
    }
}

class FileHandler {
    public static function write(string $filePath, string $content): bool {
        $dir = dirname($filePath);
        if (!is_dir($dir) || !is_writable($dir)) {
            return false;
        }
        return file_put_contents($filePath, $content) !== false;
    }

    public static function read(string $filePath) {
        return file_exists($filePath) && is_readable($filePath) 
            ? file_get_contents($filePath) 
            : null;
    }

    public static function exists(string $filePath): bool {
        return file_exists($filePath);
    }
}

class Response {
    public static function error(string $message): array {
        return ['status' => false, 'message' => $message];
    }

    public static function success(string $message): array {
        return ['status' => true, 'message' => $message];
    }
}

class DomainProcessor {
    private int $server;
    private string $hostFile;
    private string $pacFile = 'local.pac';

    public function __construct(int $server) {
        $this->server = $server;
        $this->hostFile = "byedpi/main_server_{$server}_hosts.txt";
    }

    public function validateServer(): bool {
        return $this->server >= 1 && $this->server <= 8;
    }

    public function processDomains(string $text): array {
        $text = trim($text);
        if ($text === '') {
            return $this->saveDomains([]);
        }

        $lines = explode("\n", $text);
        $validDomains = [];

        foreach ($lines as $line) {
            $domain = trim($line);
            if ($domain === '') continue;
            
            if (DomainValidator::isValid($domain)) {
                $validDomains[] = $domain;
            }
        }

        if (empty($validDomains)) {
            return Response::error("Все введённые строки не являются валидными доменами.");
        }

        $validDomains = array_unique($validDomains);
        return $this->saveDomains($validDomains);
    }

    private function saveDomains(array $validDomains): array {
        if (!FileHandler::exists($this->hostFile)) {
            return Response::error("Файл {$this->hostFile} не обнаружен.");
        }

        if (!FileHandler::write($this->hostFile, implode("\n", $validDomains))) {
            return Response::error("Не удалось записать в хост лист.");
        }

        return $this->updatePacFile($validDomains);
    }

    private function updatePacFile(array $validDomains): array {
        if (!FileHandler::exists($this->pacFile)) {
            return Response::error("Файл {$this->pacFile} не обнаружен.");
        }

        $pacContent = FileHandler::read($this->pacFile);
        if ($pacContent === null) {
            return Response::error("Не удалось прочитать PAC файл.");
        }

        $formattedDomains = array_map(function($domain) {
            return '            "' . $domain . '"';
        }, $validDomains);
        
        $newDomainsBlock = "[\n" . implode(",\n", $formattedDomains) . "\n        ]";

        $serverIndex = $this->server - 1;
        $pattern = '/"domains":\s*\[[^\]]*\]/s';
        preg_match_all($pattern, $pacContent, $matches, PREG_OFFSET_CAPTURE);

        if (!isset($matches[0][$serverIndex])) {
            return Response::error("Сервер не найден в PAC файле.");
        }

        $newContent = substr_replace(
            $pacContent,
            '"domains": ' . $newDomainsBlock,
            $matches[0][$serverIndex][1],
            strlen($matches[0][$serverIndex][0])
        );

        if (!FileHandler::write($this->pacFile, $newContent)) {
            return Response::error("Не удалось записать в PAC файл.");
        }

        return Response::success("Домены успешно записаны.");
    }
}

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
$input = json_decode(file_get_contents('php://input'), true);

if ($input === null) {
    echo json_encode(Response::error('Не валидный JSON.'));
    exit;
}

if (!isset($input['server']) || !isset($input['text'])) {
    echo json_encode(Response::error('Отсутствуют обязательные поля в JSON.'));
    exit;
}

$server = (int)$input['server'];
$text = $input['text'];

$processor = new DomainProcessor($server);
if (!$processor->validateServer()) {
    echo json_encode(Response::error('Не валидный номер сервера.'));
    exit;
}

echo json_encode($processor->processDomains($text), JSON_UNESCAPED_UNICODE);