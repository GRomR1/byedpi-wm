<?php
declare(strict_types=1);

// Early debug logging
@file_put_contents('/app/logs/byedpi/php_debug.log', "[" . date('Y-m-d H:i:s') . "] Script started\n", FILE_APPEND);

set_time_limit(60);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Cache-Control: no-store, no-cache, must-revalidate");
header("Pragma: no-cache");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    @file_put_contents('/app/logs/byedpi/php_debug.log', "[" . date('Y-m-d H:i:s') . "] OPTIONS request\n", FILE_APPEND);
    http_response_code(204);
    header('Content-Length: 0');
    exit();
}

@file_put_contents('/app/logs/byedpi/php_debug.log', "[" . date('Y-m-d H:i:s') . "] Request method: " . $_SERVER['REQUEST_METHOD'] . "\n", FILE_APPEND);

function send_json_response(array $response): void {
    echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

function is_port_in_use(int $port): array {
    if ($port < 1 || $port > 65535) {
        return ['error' => 'Неверный номер порта.'];
    }
    
    // Use netstat instead of lsof which is broken in qemu environment
    $cmd = "netstat -tlnp 2>/dev/null | grep ':$port '";
    $output = shell_exec($cmd) ?? '';
    $output = trim($output);
    
    if (!empty($output)) {
        return ['in_use' => true];
    }
    return ['in_use' => false];
}

// Debug logging function
function debug_log($msg) {
    $log_file = '/app/logs/byedpi/php_debug.log';
    $ts = date('Y-m-d H:i:s');
    @file_put_contents($log_file, "[$ts] $msg\n", FILE_APPEND);
}

function find_process(int $port, string $real_file_path): array {
    debug_log("find_process: port=$port, real_file_path=$real_file_path");
    if ($port < 1 || $port > 65535) {
        debug_log("find_process: invalid port");
        return ['error' => 'Неверный номер порта.'];
    }
    if (empty($real_file_path)) {
        debug_log("find_process: empty real_file_path");
        return ['error' => 'Путь не может быть пустым.'];
    }

    $netstat_cmd = "netstat -tlnp 2>/dev/null | grep ':$port '";
    $netstat_output = shell_exec($netstat_cmd) ?? '';
    $netstat_output = trim($netstat_output);
    debug_log("find_process: netstat output: $netstat_output");

    if (empty($netstat_output)) {
        debug_log("find_process: port not in use");
        return ['exists' => false];
    }

    if (preg_match('/LISTEN\\s+(\\d+)\//', $netstat_output, $matches)) {
        $pid = $matches[1];
        debug_log("find_process: pid from netstat: $pid");
    } else {
        $ps_output = shell_exec("ps aux | grep ciadpi | grep -v grep") ?? '';
        debug_log("find_process: ps aux output: $ps_output");
        $ps_lines = explode("\n", trim($ps_output));
        foreach ($ps_lines as $line) {
            if (strpos($line, "-p $port") !== false || strpos($line, "--port $port") !== false) {
                $parts = preg_split('/\\s+/', trim($line));
                if (count($parts) >= 2 && is_numeric($parts[1])) {
                    $pid = $parts[1];
                    debug_log("find_process: pid from ps: $pid, line: $line");
                    break;
                }
            }
        }
        if (!isset($pid)) {
            debug_log("find_process: no pid found");
            return ['exists' => false];
        }
    }

    $ps_cmd = "ps -p $pid -o args --no-headers 2>/dev/null";
    $cmdline = shell_exec($ps_cmd) ?? '';
    $cmdline = trim($cmdline);
    debug_log("find_process: cmdline for pid $pid: $cmdline");

    if (empty($cmdline)) {
        debug_log("find_process: empty cmdline");
        return ['error' => 'Не удалось получить командную строку процесса.'];
    }

    $real_basename = basename($real_file_path);
    $has_correct_port = strpos($cmdline, "-p $port") !== false || strpos($cmdline, "--port $port") !== false;
    $is_correct_binary = (strpos($cmdline, $real_file_path) !== false || 
                         strpos($cmdline, $real_basename) !== false ||
                         strpos($cmdline, 'ciadpi') !== false ||
                         strpos($cmdline, '/app/byedpi/ciadpi') !== false);
    debug_log("find_process: has_correct_port=$has_correct_port, is_correct_binary=$is_correct_binary");

    if ($is_correct_binary && $has_correct_port) {
        debug_log("find_process: process found, pid=$pid");
        return [
            'exists' => true,
            'pid' => (int)$pid,
            'cmd' => $cmdline
        ];
    }
    debug_log("find_process: process not ours");
    return ['exists' => false];
}

function start_process(string $real_file_path, int $port, string $args): array {
    if ($port < 1 || $port > 65535) {
        return ['error' => 'Неверный номер порта.'];
    }
    if (empty($real_file_path)) {
        return ['error' => 'Путь не может быть пустым.'];
    }

    // Ensure the binary exists and is executable
    if (!file_exists($real_file_path)) {
        return ['error' => 'Исполняемый файл не найден: ' . $real_file_path];
    }
    if (!is_executable($real_file_path)) {
        return ['error' => 'Файл не является исполняемым: ' . $real_file_path];
    }

    // Escape the path to handle spaces and special characters
    $escaped_path = escapeshellarg($real_file_path);
    $escaped_args = escapeshellarg($args);
    
    // Create log directory if it doesn't exist
    $log_dir = '/app/logs/byedpi';
    if (!is_dir($log_dir)) {
        @mkdir($log_dir, 0755, true);
    }
    
    $log_file = "$log_dir/port_${port}.log";
    
    // Build command with proper escaping and logging
    $command = "nohup $escaped_path --port $port $args > $log_file 2>&1 & echo \$!";
    
    $output = shell_exec($command);
    $pid = trim($output ?? '');
    
    if (!is_numeric($pid) || $pid <= 0) {
        return ['error' => 'Не удалось получить PID процесса.'];
    }
    
    // Wait a moment and verify the process started
    usleep(500000); // 0.5 seconds
    
    if (!posix_kill((int)$pid, 0)) {
        return ['error' => 'Процесс не запустился или завершился сразу после запуска.'];
    }
    
    return ['result' => true, 'pid' => (int)$pid];
}

function kill_process(int $pid): array {
    if ($pid <= 0) {
        return ['error' => 'PID должен быть положительным числом.'];
    }

    shell_exec("kill -9 $pid 2>/dev/null");
    return ['result' => true];
}

function validate_request_data(array $data): array {
    $required_fields = ['action', 'real_file_path', 'port'];
    foreach ($required_fields as $field) {
        if (!array_key_exists($field, $data)) {
            return ['error' => "Отсутствует обязательное поле: $field"];
        }
    }

    $action = $data['action'];
    $real_file_path = $data['real_file_path'];
    $port = $data['port'];

    $allowed_actions = ['check', 'check_and_start', 'check_and_kill'];
    if (!in_array($action, $allowed_actions)) {
        return ['error' => 'Недопустимое действие.'];
    }

    if (!is_string($real_file_path) || empty(trim($real_file_path)) || !file_exists($real_file_path) || !is_file($real_file_path)) {
        return ['error' => 'Путь к файлу некорректен или файл не существует.'];
    }

    if (!is_numeric($port) || intval($port) != $port || $port < 1 || $port > 65535) {
        return ['error' => 'Порт должен быть целым числом от 1 до 65535.'];
    }

    $arguments = $data['arguments'] ?? '';
    if (!is_string($arguments)) {
        return ['error' => 'Аргументы должны быть строкой.'];
    }

    $hosts_file_name = $data['hosts_file_name'] ?? null;
    if ($hosts_file_name !== null && !is_string($hosts_file_name)) {
        return ['error' => 'Имя файла hosts должно быть строкой.'];
    }

    return [
        'action' => $action,
        'real_file_path' => $real_file_path,
        'port' => (int)$port,
        'arguments' => $arguments,
        'hosts_file_name' => $hosts_file_name
    ];
}

function parse_cmd(string $cmd, int $port): array {
    $port_flag = "--port $port";
    $pos = strpos($cmd, $port_flag);
    if ($pos === false) {
        return ['arguments' => '', 'hosts_file' => false];
    }
    $start = $pos + strlen($port_flag);
    $args_str = trim(substr($cmd, $start));
    $args_array = preg_split('/\s+/', $args_str);
    $arguments = [];
    $hosts_file = false;
    $i = 0;
    while ($i < count($args_array)) {
        if ($args_array[$i] === '--hosts') {
            $hosts_file = true;
            $i += 2;
        } else {
            $arguments[] = $args_array[$i];
            $i++;
        }
    }
    return [
        'arguments' => implode(' ', $arguments),
        'hosts_file' => $hosts_file
    ];
}

function get_current_state(int $port, string $real_file_path): array {
    debug_log("get_current_state: port=$port, real_file_path=$real_file_path");
    $port_status = is_port_in_use($port);
    debug_log("get_current_state: port_status=" . json_encode($port_status));
    if (isset($port_status['error'])) {
        debug_log("get_current_state: error in port_status: " . $port_status['error']);
        return ['type' => 'error', 'error' => $port_status['error']];
    }

    if (!$port_status['in_use']) {
        debug_log("get_current_state: port free");
        return ['type' => 'free'];
    }

    $process_info = find_process($port, $real_file_path);
    debug_log("get_current_state: process_info=" . json_encode($process_info));
    if (isset($process_info['error'])) {
        debug_log("get_current_state: error in process_info: " . $process_info['error']);
        return ['type' => 'error', 'error' => $process_info['error']];
    }

    if ($process_info['exists']) {
        $parsed = parse_cmd($process_info['cmd'], $port);
        debug_log("get_current_state: process in_use_by_us, pid=" . $process_info['pid']);
        return [
            'type' => 'in_use_by_us',
            'pid' => $process_info['pid'],
            'cmd' => $process_info['cmd'],
            'arguments' => $parsed['arguments'],
            'hosts_file' => $parsed['hosts_file']
        ];
    }

    debug_log("get_current_state: port in use by others");
    return ['type' => 'in_use_by_others'];
}

function wait_for_state(int $port, string $real_file_path, string $expected_state, int $max_attempts, int $interval): array {
    for ($attempt = 0; $attempt < $max_attempts; $attempt++) {
        $state = get_current_state($port, $real_file_path);
        if ($state['type'] === $expected_state) {
            return $state;
        }
        if ($state['type'] === 'error') {
            return $state;
        }
        sleep($interval);
    }
    return ['type' => 'error', 'error' => "Не удалось достичь состояния '$expected_state' после $max_attempts попыток."];
}

function build_response(string $action, array $state, string $real_file_path, int $port): array {
    $base_response = [
        'action' => $action,
        'real_file_path' => $real_file_path,
        'port' => $port,
        'hosts_file' => false,
        'arguments' => '',
        'result' => true
    ];

    switch ($state['type']) {
        case 'error':
            return ['error.st' => true, 'message' => $state['error']];
        case 'free':
            return array_merge($base_response, ['state' => 'free', 'message' => 'Порт свободен']);
        case 'in_use_by_us':
            return array_merge($base_response, [
                'state' => 'in_use_by_us',
                'pid' => $state['pid'],
                'hosts_file' => $state['hosts_file'],
                'arguments' => $state['arguments'],
                'message' => 'Порт занят нашей программой'
            ]);
        case 'in_use_by_others':
            return array_merge($base_response, [
                'state' => 'in_use_by_others',
                'message' => 'Порт занят другой программой'
            ]);
    }
}

$input_data = file_get_contents('php://input');
@file_put_contents('/app/logs/byedpi/php_debug.log', "[" . date('Y-m-d H:i:s') . "] Input data: " . $input_data . "\n", FILE_APPEND);

$request_data = json_decode($input_data, true);
@file_put_contents('/app/logs/byedpi/php_debug.log', "[" . date('Y-m-d H:i:s') . "] JSON decode result: " . json_encode($request_data) . "\n", FILE_APPEND);

if (json_last_error() !== JSON_ERROR_NONE) {
    @file_put_contents('/app/logs/byedpi/php_debug.log', "[" . date('Y-m-d H:i:s') . "] JSON error: " . json_last_error_msg() . "\n", FILE_APPEND);
    send_json_response(['error' => true, 'message' => 'Некорректный формат JSON']);
}

$validation = validate_request_data($request_data);
@file_put_contents('/app/logs/byedpi/php_debug.log', "[" . date('Y-m-d H:i:s') . "] Validation result: " . json_encode($validation) . "\n", FILE_APPEND);

if (isset($validation['error'])) {
    send_json_response(['error' => true, 'message' => $validation['error']]);
}

$action = $validation['action'];
$real_file_path = $validation['real_file_path'];
$port = $validation['port'];
$arguments = $validation['arguments'];
$hosts_file_name = $validation['hosts_file_name'];

$args = $arguments;
if ($hosts_file_name !== null) {
    $args = '--hosts ' . escapeshellarg($hosts_file_name) . ' ' . $arguments;
}

$max_attempts = 10;
$interval = 1;

switch ($action) {
    case 'check':
        $state = get_current_state($port, $real_file_path);
        send_json_response(build_response($action, $state, $real_file_path, $port));
		break;

    case 'check_and_start':
        $state = get_current_state($port, $real_file_path);
        if ($state['type'] === 'error') {
            send_json_response(['error' => true, 'message' => $state['error']]);
        }
        if ($state['type'] === 'in_use_by_us') {
            $response = build_response($action, $state, $real_file_path, $port);
            $response['message'] = 'Процесс уже запущен';
            send_json_response($response);
        }
        if ($state['type'] === 'in_use_by_others') {
            send_json_response([
                'action' => $action,
                'real_file_path' => $real_file_path,
                'port' => $port,
                'message' => 'Порт занят другой программой',
                'result' => false
            ]);
        }

        $start_result = start_process($real_file_path, $port, $args);
        if (isset($start_result['error'])) {
            send_json_response(['error' => true, 'message' => $start_result['error']]);
        }

        $state = wait_for_state($port, $real_file_path, 'in_use_by_us', $max_attempts, $interval);
        $response = build_response($action, $state, $real_file_path, $port);
        $response['message'] = $state['type'] === 'in_use_by_us' ? 'Процесс успешно запущен' : 'Не удалось запустить процесс';
        $response['result'] = $state['type'] === 'in_use_by_us';
        send_json_response($response);
		break;

    case 'check_and_kill':
        $state = get_current_state($port, $real_file_path);
        if ($state['type'] === 'error') {
            send_json_response(['error' => true, 'message' => $state['error']]);
        }
        if ($state['type'] === 'free') {
            $response = build_response($action, $state, $real_file_path, $port);
            $response['message'] = 'Порт свободен';
            send_json_response($response);
        }
        if ($state['type'] === 'in_use_by_others') {
            send_json_response([
                'action' => $action,
                'real_file_path' => $real_file_path,
                'port' => $port,
                'message' => 'Порт занят другой программой, невозможно остановить',
                'result' => false
            ]);
        }

        $kill_result = kill_process($state['pid']);
        if (isset($kill_result['error'])) {
            send_json_response(['error' => true, 'message' => $kill_result['error']]);
        }

        $state = wait_for_state($port, $real_file_path, 'free', $max_attempts, $interval);
        $response = build_response($action, $state, $real_file_path, $port);
        $response['message'] = $state['type'] === 'free' ? 'Процесс успешно остановлен' : 'Не удалось остановить процесс';
        $response['result'] = $state['type'] === 'free';
        send_json_response($response);
		break;

    default:
        send_json_response(['error' => true, 'message' => 'Неизвестное действие']);
}
?>