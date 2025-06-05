# MikroTik Troubleshooting Guide - ByeDPI Web Manager

## Проблема: Timeout'ы на MikroTik vs нормальная работа на Ubuntu

### Описание проблемы
На MikroTik RouterOS все curl запросы timeout'ятся с ошибкой:
```
Connection timed out after 2000+ milliseconds (код: 28)
```

На Ubuntu тот же код работает нормально с HTTP кодами 200/302/404/etc.

## Инструменты диагностики

### 1. Веб-интерфейс диагностики
Откройте в браузере: `http://your-mikrotik-ip:8080/mikrotik_debug.html`

Этот интерфейс позволяет:
- ✅ Проверить системную информацию
- ✅ Проверить DNS connectivity
- ✅ Проверить запущенные процессы ByeDPI
- ✅ Проверить SOCKS5 прокси
- ✅ Протестировать прямые подключения
- ✅ Получить рекомендации по исправлению

### 2. API диагностики
Можно использовать прямые API вызовы к `mikrotik_debug.php`:

```bash
# Информация о системе
curl http://your-mikrotik-ip:8080/mikrotik_debug.php

# Полная диагностика
curl -X POST http://your-mikrotik-ip:8080/mikrotik_debug.php \
  -H "Content-Type: application/json" \
  -d '{"action": "full"}'

# Тест конкретного порта
curl -X POST http://your-mikrotik-ip:8080/mikrotik_debug.php \
  -H "Content-Type: application/json" \
  -d '{"action": "port_test", "port": 20001}'

# Тест прямого подключения
curl -X POST http://your-mikrotik-ip:8080/mikrotik_debug.php \
  -H "Content-Type: application/json" \
  -d '{"action": "direct_test", "url": "https://youtube.com"}'
```

## Основные причины и решения

### 1. Недостаточные таймауты curl
**Проблема:** По умолчанию установлены маленькие таймауты (2-4 секунды).

**Решение:**
1. Откройте веб-интерфейс ByeDPI Web Manager
2. Перейдите в "Настройка Curl" 
3. Увеличьте таймауты:
   - **Таймаут соединения:** 5-10 секунд
   - **Максимальный таймаут:** 15-30 секунд

### 2. Проблемы с сетевой конфигурацией контейнера

**Диагностика:**
```bash
# Проверьте что контейнер запущен
docker ps | grep byedpi

# Проверьте маппинг портов
docker port byedpi-web-manager

# Проверьте логи контейнера
docker logs byedpi-web-manager

# Проверьте сетевые интерфейсы внутри контейнера
docker exec byedpi-web-manager ip addr show
```

**Возможные решения:**
```bash
# Пересоздать контейнер с правильными портами
docker rm -f byedpi-web-manager

# Запустить с правильным маппингом портов
docker run -d \
  --name byedpi-web-manager \
  -p 8080:80 \
  -p 20001-20028:20001-20028 \
  -v byedpi_data:/app/data \
  --cap-add NET_ADMIN \
  --cap-add NET_RAW \
  eblet/byedpi-web-manager:latest
```

### 3. Проблемы с DNS резолвингом

**Диагностика:** Используйте веб-интерфейс диагностики или:
```bash
# Проверка DNS внутри контейнера
docker exec byedpi-web-manager nslookup youtube.com

# Проверка с другими DNS серверами
docker exec byedpi-web-manager nslookup youtube.com 8.8.8.8
```

**Решение:** Добавить DNS серверы в docker-compose.yml:
```yaml
services:
  byedpi-web-manager:
    # ... другие настройки
    dns:
      - 8.8.8.8
      - 1.1.1.1
```

### 4. Ограничения ресурсов на MikroTik

**Диагностика:**
```bash
# Проверка использования ресурсов
docker stats byedpi-web-manager

# Проверка доступной памяти на роутере
/system resource print
```

**Решение:** Увеличить лимиты ресурсов:
```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M  # Увеличить с 256M
    reservations:
      cpus: '0.5'   # Увеличить с 0.25
      memory: 256M  # Увеличить с 128M
```

### 5. Проблемы с правами доступа

MikroTik может требовать дополнительные права:
```yaml
services:
  byedpi-web-manager:
    privileged: true  # Добавить если нужно
    user: "0:0"      # Root права
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - SYS_ADMIN    # Добавить если нужно
```

### 6. Проблемы с veth интерфейсом на MikroTik

**Проверка настроек veth:**
```bash
/interface veth print
/container print
/container environment print
```

**Типичные настройки для MikroTik:**
```bash
# Создание veth интерфейса
/interface veth
add address=172.17.0.2/24 gateway=172.17.0.1 name=veth-byedpi

# Добавление контейнера
/container
add remote-image=eblet/byedpi-web-manager:latest \
    interface=veth-byedpi \
    root-dir=disk1/docker/byedpi \
    logging=yes \
    start-on-boot=yes

# Настройка портов (если нужно)
/container
set 0 cmd="supervisord -c /etc/supervisord.conf -n"
```

## Пошаговая диагностика

### Шаг 1: Проверка базовой работоспособности
1. Откройте `http://mikrotik-ip:8080/mikrotik_debug.html`
2. Нажмите "Проверка системы"
3. Проверьте что все основные компоненты работают

### Шаг 2: Полная диагностика
1. Нажмите "Полная диагностика"
2. Дождитесь завершения всех тестов
3. Изучите рекомендации

### Шаг 3: Настройка таймаутов
1. Откройте основной интерфейс: `http://mikrotik-ip:8080/`
2. Найдите секцию "Настройка Curl"
3. Установите:
   - Таймаут соединения: **8-10 секунд**
   - Максимальный таймаут: **20-30 секунд**

### Шаг 4: Тест конкретного порта
1. В диагностическом интерфейсе найдите секцию "Ручная проверка"
2. Введите порт (например 20001)
3. Нажмите "Проверить порт"
4. Изучите подробные результаты

### Шаг 5: Проверка ByeDPI процессов
Убедитесь что сервера запущены:
1. В основном интерфейсе найдите секцию "ByeDPI для использования"
2. Проверьте что нужные сервера запущены
3. Если нет - запустите их

## Частые ошибки и решения

### `Connection timed out after X milliseconds (код: 28)`
- ✅ Увеличьте таймауты curl
- ✅ Проверьте что ByeDPI процессы запущены
- ✅ Проверьте сетевые настройки контейнера

### `Could not connect to proxy (код: 7)`
- ✅ Проверьте что порт действительно слушается
- ✅ Проверьте маппинг портов в Docker
- ✅ Проверьте настройки файрвола

### `Couldn't resolve host (код: 6)`
- ✅ Проверьте DNS настройки
- ✅ Добавьте публичные DNS серверы
- ✅ Проверьте интернет-подключение

### Процессы ciadpi не запускаются
- ✅ Проверьте права на файлы ciadpi
- ✅ Проверьте архитектуру (ARM vs x86)
- ✅ Проверьте логи контейнера

## Логи и отладка

### Логи контейнера
```bash
docker logs -f byedpi-web-manager
```

### Логи ByeDPI процессов
```bash
docker exec byedpi-web-manager ps aux | grep ciadpi
docker exec byedpi-web-manager netstat -tlnp | grep 200
```

### Тест сети изнутри контейнера
```bash
# Проверка DNS
docker exec byedpi-web-manager nslookup youtube.com

# Проверка подключения
docker exec byedpi-web-manager curl -I https://youtube.com

# Проверка портов
docker exec byedpi-web-manager netstat -tlnp
```

## Оптимизация для MikroTik

### Рекомендуемые настройки docker-compose.yml:
```yaml
services:
  byedpi-web-manager:
    image: eblet/byedpi-web-manager:latest
    container_name: byedpi-web-manager
    restart: unless-stopped
    
    ports:
      - "8080:80"
      - "20001-20028:20001-20028"
    
    volumes:
      - byedpi_data:/app/data
      - byedpi_logs:/app/logs
    
    environment:
      - TZ=Europe/Moscow
      - PHP_MEMORY_LIMIT=256M        # Увеличено
      - PHP_MAX_EXECUTION_TIME=600   # Увеличено
      
    dns:
      - 8.8.8.8
      - 1.1.1.1
      
    user: "0:0"
    cap_add:
      - NET_ADMIN
      - NET_RAW
    
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M    # Увеличено
        reservations:
          cpus: '0.5'     # Увеличено
          memory: 256M    # Увеличено
          
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80/"]
      interval: 60s      # Увеличено
      timeout: 30s       # Увеличено
      retries: 3
      start_period: 60s  # Увеличено
```

## Контакты и поддержка

Если проблема не решается:
1. Запустите полную диагностику через веб-интерфейс
2. Сохраните результаты JSON
3. Соберите логи: `docker logs byedpi-web-manager > logs.txt`
4. Опишите проблему в issue с приложением логов

---
**Важно:** Всегда тестируйте изменения на тестовом окружении перед применением на продакшене! 