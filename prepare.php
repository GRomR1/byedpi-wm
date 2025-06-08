<?php
// Router for new modular structure
// This file routes old API calls to new modular structure

declare(strict_types=1);
set_time_limit(60);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Cache-Control: no-store, no-cache, must-revalidate");
header("Pragma: no-cache");
header('Content-Type: application/json; charset=utf-8');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    header('Content-Length: 0');
    exit();
}

// Include config adapter
require_once 'config_adapter.php';

// Helper function to make HTTP request to module
function fetchModuleData(string $module): ?array {
    $url = "http://localhost" . $_SERVER['REQUEST_URI'];
    $url = str_replace(basename($_SERVER['SCRIPT_NAME']), "php/$module", $url);
    
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 10,
            'header' => "User-Agent: ByeDPI-Router\r\n"
        ]
    ]);
    
    $response = @file_get_contents($url, false, $context);
    if ($response === false) {
        return null;
    }
    
    $data = json_decode($response, true);
    return json_last_error() === JSON_ERROR_NONE ? $data : null;
}

// Main prepare logic - calls multiple modules in sequence
try {
    $result = [];
    
    // 1. OS Detection
    $osData = fetchModuleData('1_os_detect.php');
    if ($osData && isset($osData['операционная_система'])) {
        $detectedOS = $osData['операционная_система'];
        $result['os'] = ['detected_os' => $detectedOS === 'не поддерживается' ? 'unsupported' : $detectedOS];
    } else {
        $result['os'] = ['detected_os' => 'unsupported'];
    }
    
    // Stop if OS is not supported
    if ($result['os']['detected_os'] === 'unsupported') {
        $result['error'] = 'Unsupported operating system';
        echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit();
    }
    
    $os = $result['os']['detected_os'];
    
    // 2. PHP Extensions Check (Linux only for now)
    if ($os === 'linux') {
        $phpData = fetchModuleData('2_linux_php_check.php');
        if ($phpData && isset($phpData['проверки'])) {
            // Convert Russian field names to English for compatibility
            $phpChecks = [];
            foreach ($phpData['проверки'] as $key => $value) {
                switch ($key) {
                    case 'shell_exec':
                        $phpChecks['shell_exec'] = $value;
                        break;
                    case 'file_get_contents':
                        $phpChecks['file_get_contents'] = $value;
                        break;
                    case 'curl':
                        $phpChecks['php_curl'] = $value;
                        break;
                    default:
                        $phpChecks[$key] = $value;
                }
            }
            $result['php'] = $phpChecks;
        } else {
            $result['php'] = ['shell_exec' => false, 'file_get_contents' => false, 'php_curl' => false];
        }
        
        // 3. Linux Tools Check
        $toolsData = fetchModuleData('3_linux_tools_check.php');
        if ($toolsData && isset($toolsData['утилиты_и_функции'])) {
            $result['tools_and_functions'] = $toolsData['утилиты_и_функции'];
        } else {
            $result['tools_and_functions'] = [];
        }
        
        // 4. Files Check
        $filesData = fetchModuleData('4_linux_files_check.php');
        if ($filesData && isset($filesData['файлы'])) {
            $result['files'] = $filesData['файлы'];
        } else {
            $result['files'] = [];
        }
    }
    
    // 5. Read Configuration using adapter
    $config = ConfigAdapter::loadConfig('config.json');
    if ($config !== null) {
        $result['config'] = [
            'local_ip' => $config['local_ip'] ?? '127.0.0.1',
            'ciadpi_main_servers_tcp_ports' => $config['ciadpi_main_servers_tcp_ports'] ?? [],
            'ciadpi_main_servers_latest_used_strategies' => $config['ciadpi_main_servers_latest_used_strategies'] ?? [],
            'ciadpi_test_servers_tcp_ports' => $config['ciadpi_test_servers_tcp_ports'] ?? [],
            'select_links' => $config['select_links'] ?? []
        ];
    } else {
        $result['config'] = [];
    }
    
    // 6. Detect first GGC domain
    $ggcData = fetchModuleData('6_detect_first_ggc_domain.php');
    if ($ggcData && isset($ggcData['домен'])) {
        $result['your_google_global_cache'] = $ggcData['домен'];
    } else {
        $result['your_google_global_cache'] = "Google Global Cache не удалось определить.";
    }
    
    // 7. PAC file update
    $pacData = fetchModuleData('8_update_pac.php');
    if ($pacData && isset($pacData['результат'])) {
        $result['pac_update'] = ['success' => $pacData['результат']];
    } else {
        $result['pac_update'] = ['success' => false];
    }
    
    // Return combined result
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    
} catch (Exception $e) {
    $error_result = [
        'error' => 'Internal server error: ' . $e->getMessage(),
        'status' => 'error'
    ];
    echo json_encode($error_result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
?>