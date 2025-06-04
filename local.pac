function FindProxyForURL(url, host) {
    const servers = [
    {
        "ip": "127.0.0.1",
        "port": 20001,
        "domains": []
    },
    {
        "ip": "127.0.0.1",
        "port": 20002,
        "domains": []
    },
    {
        "ip": "127.0.0.1",
        "port": 20003,
        "domains": []
    },
    {
        "ip": "127.0.0.1",
        "port": 20004,
        "domains": [
            "youtu.be",
            "yuotube.com",
            "googlevideo.com"
        ]
    },
    {
        "ip": "127.0.0.1",
        "port": 20005,
        "domains": []
    },
    {
        "ip": "127.0.0.1",
        "port": 20006,
        "domains": []
    },
    {
        "ip": "127.0.0.1",
        "port": 20007,
        "domains": []
    },
    {
        "ip": "127.0.0.1",
        "port": 20008,
        "domains": []
    }
];

    if (servers.length === 0) {
        return "DIRECT";
    }

    const exactMap = new Map();
    const suffixRules = [];
    
    for (const [serverIndex, server] of servers.entries()) {
        if (server.domains.length === 0) continue;
        
        for (const domain of server.domains) {
            const lowerDomain = domain.toLowerCase();
            exactMap.set(lowerDomain, serverIndex);
            suffixRules.push({
                domain: `.${lowerDomain}`,
                serverIndex: serverIndex
            });
        }
    }
    
    suffixRules.sort((a, b) => b.domain.length - a.domain.length);
    const lowerHost = host.toLowerCase();

    if (exactMap.has(lowerHost)) {
        const server = servers[exactMap.get(lowerHost)];
        return `SOCKS5 ${server.ip}:${server.port}`;
    }

    for (const {domain, serverIndex} of suffixRules) {
        if (dnsDomainIs(lowerHost, domain)) {
            const server = servers[serverIndex];
            return `SOCKS5 ${server.ip}:${server.port}`;
        }
    }

    return "DIRECT";
}