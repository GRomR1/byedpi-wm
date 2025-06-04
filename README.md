# ByeDPI Web Manager (Docker)

**Оригинальный скрипт скачан отсюда:**
https://ntc.party/t/byedpi-web-manager-windows-linux

Из-за моей хотелки, проект был полностью докеризован для удобного запуска на любых системах (включая MikroTik, ARM/x86)

## Быстрый старт

```bash
# Сначала скачайте образ напрямую (Docker Hub):
docker pull eblet/byedpi-web-manager:latest

# Или сразу запускайте контейнер (данные сохранятся на диск):
docker run -d \
  --name byedpi-web-manager \
  -p 8080:80 \
  -v $(pwd)/data:/app/data \
  eblet/byedpi-web-manager:latest
```

## Для MikroTik (RouterOS 7+)
1. Создайте veth интерфейс и запустите контейнер с терминала:

```bash
/interface veth
add address=192.168.254.2/24 gateway=192.168.254.1 name=byedpi

/container/add remote-image=eblet/byedpi-web-manager:latest root-dir=usb1/docker/byedpi interface=byedpi logging=yes
/container/start 0
```

## Особенности
- Все настройки через веб-интерфейс (порт 8080)
- Поддержка ARMv6/v7, ARM64, AMD64 (x86_64)
- Всё работает в Docker, никаких зависимостей
- Можно использовать на роутерах MikroTik с контейнерами

## Локальная сборка образов (build.sh)

Можно собрать образы под любую архитектуру прямо у себя:

```bash
# Только для вашей архитектуры (например, amd64):
./docker/build.sh amd64

# Для ARMv6 (старые MikroTik, Pi Zero и т.д.):
./docker/build.sh armv6

# Для мультиархитектурного образа (требует buildx и qemu):
./docker/build.sh multi

# Для всех архитектур и экспорта в tar:
./docker/build.sh all
```
Запуск локально собранного образа (например, amd64):

```bash
docker run -d -p 8080:80 byedpi-web-manager:amd64
```

## Лицензия
MIT

---

**Оригинальный топик:** https://ntc.party/t/byedpi-web-manager-windows-linux

**Docker версия подготовлена по просьбам пользователей** 