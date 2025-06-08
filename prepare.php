<?php
set_time_limit(60);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET");
header("Access-Control-Allow-Headers: Content-Type");
header("Cache-Control: no-store, no-cache, must-revalidate");
header("Pragma: no-cache");
header('Content-Type: application/json; charset=utf-8');

interface OSDetectorInterface {
    public function detect(): string;
}

interface ExtensionCheckerInterface {
    public function check(): array;
}

interface ToolCheckerInterface {
    public function check(): array;
}

interface FileOperatorInterface {
    public function checkAllFiles(): array;
    public function updatePacFile(): bool;
    public function readConfig(): ?array;
}

class OSDetector implements OSDetectorInterface {
    public function detect(): string {
        if (defined('PHP_OS_FAMILY')) {
            $os = PHP_OS_FAMILY;
        } else {
            $os = PHP_OS;
            if (stripos($os, 'WIN') === 0) {
                $os = 'Windows';
            } elseif (stripos($os, 'Linux') === 0) {
                $os = 'Linux';
            } else {
                $os = 'Unsupported';
            }
        }
        return strtolower($os);
    }
}

class PHPExtensionChecker implements ExtensionCheckerInterface {
    private $os;
    private $disabledFunctions;

    public function __construct(string $os) {
        $this->os = $os;
        $this->disabledFunctions = explode(',', ini_get('disable_functions') ?: '');
    }

    public function check(): array {
        $checks = [
            'shell_exec' => !in_array('shell_exec', $this->disabledFunctions),
            'file_get_contents' => !in_array('file_get_contents', $this->disabledFunctions),
            'php_curl' => extension_loaded('curl')
        ];

        if ($this->os === 'windows') {
            $checks['popen'] = $this->checkPopen();
            $checks['com_dotnet'] = $this->checkComDotnet();
            $checks['wmi_connect'] = $this->checkWMI();
        }

        return $checks;
    }

    private function checkComDotnet(): bool {
        return extension_loaded('com_dotnet');
    }

    private function checkWMI(): bool {
        if (!class_exists('COM')) {
            return false;
        }
        try {
            new COM('WbemScripting.SWbemLocator');
            return true;
        } catch (Exception $e) {
            return false;
        }
    }

    private function checkPopen(): bool {
        return !in_array('popen', $this->disabledFunctions);
    }
}

class SystemToolChecker implements ToolCheckerInterface {
    private $os;
    private $execEnabled;
    private $fileGetContentsEnabled;

    public function __construct(string $os, bool $execEnabled, bool $fileGetContentsEnabled) {
        $this->os = $os;
        $this->execEnabled = $execEnabled;
        $this->fileGetContentsEnabled = $fileGetContentsEnabled;
    }

    public function check(): array {
        return $this->os === 'windows'
            ? $this->checkWindowsTools()
            : $this->checkLinuxTools();
    }

    private function checkWindowsTools(): array {
        return ['powershell' => $this->testCommand('where powershell')];
    }

    private function checkLinuxTools(): array {
        $tools = ['lsof', 'nohup', 'kill'];
        $result = [];
        foreach ($tools as $tool) {
            $result[$tool] = $this->testCommand("which $tool");
        }

        $procMounted = is_dir('/proc');
        return array_merge($result, [
            '/proc_mounted' => $procMounted,
            '/proc_exe_readable' => $procMounted && $this->checkProcFile('/proc/self/exe'),
            '/proc_cmdline_readable' => $procMounted && $this->checkProcFile('/proc/self/cmdline')
        ]);
    }

    private function testCommand(string $cmd): bool {
        if (!$this->execEnabled) return false;
        $redirect = $this->os === 'windows' ? '2>NUL' : '2>/dev/null';
        exec("$cmd $redirect", $_, $code);
        return $code === 0;
    }

    private function checkProcFile(string $path): bool {
        return $this->fileGetContentsEnabled && @file_get_contents($path, false, null, 0, 1) !== false;
    }
}

class FileOperator implements FileOperatorInterface {
    private $os;
    private $rootDir;
    private $configPath = 'config.json';
    private $pacPath = 'local.pac';

    public function __construct(string $os) {
        $this->os = $os;
        $this->rootDir = __DIR__;
    }

    public function checkAllFiles(): array {
        return [
            'ciadpi_file' => $this->checkCiadpiFile(),
            'config_file' => $this->checkFile($this->configPath, ['writable', 'valid']),
            'curl_certificate_file' => $this->checkFile('curl_cert/cacert.pem'),
            'pac_file' => $this->checkFile($this->pacPath, ['writable', 'updated']),
            ($this->os === 'windows' ? 'windows_file' : 'linux_file') => $this->checkProcessFile(),
            'main_server_hosts' => $this->checkMainHostsFiles()
        ];
    }

    public function updatePacFile(): bool {
        $config = $this->readConfig();
        if (!$config || !$this->validateConfig($config)) return false;

        $pacContent = file_get_contents($this->pacPath);
        if ($pacContent === false) return false;

        $servers = [];
        for ($i = 1; $i <= 8; $i++) {
            $portKey = "main_$i";
            $port = $config['ciadpi_main_servers_tcp_ports'][$portKey] ?? null;
            if (is_numeric($port)) {
                $domains = $this->readHostsFile("byedpi/main_server_{$i}_hosts.txt");
                $servers[] = [
                    'ip' => $config['local_ip'],
                    'port' => $port,
                    'domains' => $domains
                ];
            }
        }

        $serversJson = json_encode($servers, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if ($serversJson === false) return false;

        $newContent = preg_replace(
            '/const servers = \[.*?\];/s',
            "const servers = $serversJson;",
            $pacContent
        );
        if ($newContent === null) return false;

        return file_put_contents($this->pacPath, $newContent) !== false;
    }

    public function readConfig(): ?array {
        $content = @file_get_contents($this->configPath);
        if ($content === false) return null;

        $config = json_decode($content, true);
        if (json_last_error() !== JSON_ERROR_NONE) return null;

        return $config;
    }

    private function checkCiadpiFile(): array {
        $exe = $this->os === 'windows' ? 'ciadpi.exe' : 'ciadpi';
        $path = "byedpi/$exe";
        return $this->checkFile($path, ['executable']);
    }

    private function checkProcessFile(): array {
        $filename = $this->os === 'windows' ? 'windows.php' : 'linux.php';
        return $this->checkFile($filename);
    }

    private function checkMainHostsFiles(): array {
        $result = [];
        for ($i = 1; $i <= 8; $i++) {
            $path = "byedpi/main_server_{$i}_hosts.txt";
            $result["main_server_{$i}_hosts_file"] = array_merge(
                $this->checkFile($path, ['writable', 'hosts']),
                ['hosts' => $this->readHostsFile($path)]
            );
        }
        return $result;
    }

    private function checkFile(string $path, array $flags = []): array {
        $fullPath = $this->rootDir . '/' . $path;
        $exists = file_exists($fullPath);
        $result = [
            'filename' => basename($path),
            'filepath' => realpath($fullPath) ?: $fullPath,
            'exists' => $exists,
            'is_file' => $exists && is_file($fullPath),
            'readable' => $exists && is_readable($fullPath)
        ];

        foreach ($flags as $flag) {
            switch ($flag) {
                case 'executable':
                    $result['executable'] = $exists && is_executable($fullPath);
                    break;
                case 'writable':
                    $result['writable'] = $exists && is_writable($fullPath);
                    break;
                case 'valid':
                    $config = $this->readConfig();
                    $result['valid'] = $config !== null && $this->validateConfig($config);
                    break;
                case 'hosts':
                    $result['hosts'] = $this->readHostsFile($path);
                    break;
            }
        }
        return $result;
    }

    private function readHostsFile(string $path): array {
        $content = @file_get_contents($this->rootDir . '/' . $path);
        if ($content === false) return [];
        return array_filter(array_map('trim', explode("\n", $content)));
    }

    private function validateConfig(?array $config): bool {
        if (!$config || !isset($config['local_ip']) || !filter_var($config['local_ip'], FILTER_VALIDATE_IP)) {
            return false;
        }

        if (!isset($config['ciadpi_main_servers_tcp_ports']) || !is_array($config['ciadpi_main_servers_tcp_ports'])) {
            return false;
        }

        foreach ($config['ciadpi_main_servers_tcp_ports'] as $port) {
            if (!is_numeric($port) || $port < 1 || $port > 65535) {
                return false;
            }
        }

        return true;
    }
}

function getCurrentGgcDomain() {
    $sources = [
        "https://redirector.gvt1.com/report_mapping?di=no",
        "http://redirector.c.googlevideo.com/report_mapping?di=no"
    ];

    $decoder = [
        'u' => '0', 'z' => '1', 'p' => '2', 'k' => '3', 'f' => '4', 'a' => '5',
        '5' => '6', '0' => '7', 'v' => '8', 'q' => '9', 'l' => 'a', 'g' => 'b',
        'b' => 'c', '6' => 'd', '1' => 'e', 'w' => 'f', 'r' => 'g', 'm' => 'h',
        'h' => 'i', 'c' => 'j', '7' => 'k', '2' => 'l', 'x' => 'm', 's' => 'n',
        'n' => 'o', 'i' => 'p', 'd' => 'q', '8' => 'r', '3' => 's', 'y' => 't',
        't' => 'u', 'o' => 'v', 'j' => 'w', 'e' => 'x', '9' => 'y', '4' => 'z',
        '-' => '-'
    ];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 4,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    ]);

    foreach ($sources as $url) {
        curl_setopt($ch, CURLOPT_URL, $url);
        $response = curl_exec($ch);

        if (!$response) continue;

        if (preg_match('/=>\s*([a-z0-9\-]+)\b/', $response, $match)) {
            $prefix = trim($match[1], '.: ');
            $converted = '';

            foreach (str_split($prefix) as $char) {
                $converted .= $decoder[$char] ?? $char;
            }

            curl_close($ch);
            return "https://rr1---sn-{$converted}.googlevideo.com/generate_204";
        }
    }

    curl_close($ch);
    return null;
}

$osDetector = new OSDetector();
$os = $osDetector->detect();

$response = [
    'os' => ['detected_os' => $os],
    'php' => [],
    'tools_and_functions' => [],
    'files' => [],
    'config' => []
];

if ($os === 'unsupported') {
    echo json_encode($response, JSON_PRETTY_PRINT);
    exit;
}

$phpChecker = new PHPExtensionChecker($os);
$phpCheck = $phpChecker->check();
$response['php'] = $phpCheck;

$toolChecker = new SystemToolChecker(
    $os,
    $phpCheck['shell_exec'],
    $phpCheck['file_get_contents']
);
$response['tools_and_functions'] = $toolChecker->check();

$fileOperator = new FileOperator($os);
$fileResults = $fileOperator->checkAllFiles();
$response['files'] = $fileResults;

$config = $fileOperator->readConfig();
if ($config !== null) {
    $response['config'] = [
        'local_ip' => $config['local_ip'] ?? null,
        'ciadpi_main_servers_tcp_ports' => $config['ciadpi_main_servers_tcp_ports'] ?? [],
        'ciadpi_main_servers_latest_used_strategies' => $config['ciadpi_main_servers_latest_used_strategies'] ?? [],
        'ciadpi_test_servers_tcp_ports' => $config['ciadpi_test_servers_tcp_ports'] ?? [],
        'select_links' => $config['select_links'] ?? []
    ];
}

$response['pac_update'] = ['success' => false];
if (($fileResults['pac_file']['writable'] ?? false)) {
    $response['pac_update']['success'] = $fileOperator->updatePacFile();
}

$ggcDomain = null;
if (($phpCheck['php_curl'] ?? false)) {
    $ggcDomain = getCurrentGgcDomain();
}
$response['your_google_global_cache'] = $ggcDomain ?? "Google Global Cache не удалось определить.";

echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
?>