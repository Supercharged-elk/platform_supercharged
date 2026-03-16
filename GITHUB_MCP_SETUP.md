# GitHub MCP Setup

Agregar este bloque al archivo:
~/Library/Application Support/Claude/claude_desktop_config.json

Dentro de "mcpServers":

```json
"github": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "TU_GITHUB_TOKEN_AQUI"
  },
  "type": "stdio"
}
```

Tu token GitHub lo obtienes con:
  gh auth token

O en: https://github.com/settings/tokens
Permisos necesarios: repo, issues, projects

Una vez agregado → reiniciar Claude Desktop.
