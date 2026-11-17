# reflex: funciones que merece la pena copiar de otras herramientas

Continúa `research-actions-proxy.md` y `research-nl-shell.md` (no repito resolvers, cachés ni MCP de macOS). Investigado el 2026-11-06. Esfuerzo: S ≈ días, M ≈ 1–2 semanas, L ≈ más.

## 1. Interacción / UX

| Función | Origen | Por qué encaja en reflex | Esf. |
|---|---|---|---|
| **Clasificador local + denylist + interruptor** | Warp: la detección de lenguaje natural corre en local, con `ai_command_denylist` y `/natural-language-detection` ([ajustes](https://docs.warp.dev/terminal/settings/all-settings/), [CLI](https://docs.warp.dev/agents/cli/quickstart/)) | La queja típica de Warp son los falsos positivos con alias y comandos reales ([#5552](https://github.com/warpdotdev/warp/issues/5552)). reflex necesita la misma válvula: no tocar nunca lo que ya es un comando o un alias | S |
| **Ghost text con estrategia en cadena** | zsh-autosuggestions: `ZSH_AUTOSUGGEST_STRATEGY=(history completion)` y estilo propio ([README](https://github.com/zsh-users/zsh-autosuggestions)) | Mostrar en gris la acción resuelta (`abre descargas → open ~/Downloads`). La cadena de estrategias calca los niveles de reflex | S |
| **Fallback commands** | Raycast: si no hay coincidencias, una lista configurable de comandos recibe el texto como `fallbackText` ([lifecycle](https://developers.raycast.com/information/lifecycle), [ajustes](https://manual.raycast.com/settings)) | Sin plantilla, el usuario elige el destino: Claude, un Shortcut o la web, en vez de un «¿enviar a Claude?» binario | S |
| **Quick Keys con sugerencia automática** | Spotlight en Tahoe: abreviaturas de hasta 12 caracteres, propuestas por iniciales («SM» = Send Message) ([MacRumors](https://www.macrumors.com/how-to/do-more-with-spotlight-in-macos-tahoe/), [MacMost](https://macmost.com/how-to-use-spotlight-actions-in-macos-tahoe.html)) | Las frases aprobadas que más se repiten reciben una abreviatura propuesta. Coincidencia exacta, sin modelo | S |
| **Placeholders de argumento con default y modificadores** | Raycast `{argument default=…}`, `{clipboard offset=1}`, `| trim` ([manual](https://manual.raycast.com/dynamic-placeholders)) | Los slots pueden tomar valor del portapapeles o de la selección del Finder; las frases cortas («manda esto a Ana») resuelven sin modelo | M |

## 2. Catálogo y extensibilidad

| Función | Origen | Por qué encaja | Esf. |
|---|---|---|---|
| **Gramática de plantillas con listas, rangos y wildcards** | Home Assistant/hassil: `{0..100:brillo}`, `wildcard: true`, `expansion_rules`, y la regla de que una lista no puede ir dentro de un opcional ([sintaxis](https://developers.home-assistant.io/docs/voice/intent-recognition/template-sentence-syntax/)) | Un formato probado para las plantillas aprendidas, que además sirve como datos de entrenamiento para FunctionGemma | M |
| **Acciones sobre la selección** | Alfred Universal/File Actions, filtradas por tipo de fichero ([ayuda](https://www.alfredapp.com/help/workflows/triggers/file-action/)) | Verbos que actúan sobre «esto»: el fichero del Finder seleccionado o el portapapeles | M |
| **Packs por repo con argumentos enum** | Warp Workflows: YAML en `.warp/workflows/` con `arguments` y enums ([YAML](https://docs.warp.dev/terminal/entry/yaml-workflows/), [Drive](https://docs.warp.dev/knowledge-and-collaboration/warp-drive/workflows/)) | `.reflex/` por proyecto: los enums cierran los slots y así el modelo pequeño no puede inventar valores | M |
| **Entidades con acciones *Find*** | App Intents: Apple pide exponer acciones de búsqueda y las propiedades de cada entidad ([WWDC25-260](https://developer.apple.com/videos/play/wwdc2025/260/)) | Verbos de solo lectura (`find file`, `find contact`) que alimentan los slots de los verbos que actúan | M |

## 3. Aprendizaje / personalización

- **Sembrar el catálogo desde el historial**: Atuin tiene «History-to-Runbook» en su hoja de ruta ([blog](https://blog.atuin.sh/atuin-desktop-runbooks-that-run/)). reflex puede minar las líneas `open`, `shortcuts run` y `osascript` ya ejecutadas y proponerlas como plantillas. **M**
- **Sincronizar lo aprendido**: Atuin sincroniza alias y variables de entorno entre máquinas ([docs](https://docs.atuin.sh/latest/guide/dotfiles/)). Las plantillas aprobadas son datos personales, y basta con un fichero que se pueda versionar con git. **S**
- **Receta de fine-tuning de Google**: Mobile Actions subió la precisión de FunctionGemma del 58 % al 85 % ([blog](https://blog.google/innovation-and-ai/technology/developers-tools/functiongemma/), [modelo](https://huggingface.co/litert-community/FunctionGemma_270M_Mobile_Actions)). Conviene reutilizar su formato de dataset. Ojo: no hay ruta documentada de LoRA → GGUF → Ollama ([Unsloth GGUF](https://huggingface.co/unsloth/functiongemma-270m-it-GGUF)). **M**

## 4. Seguridad y confianza

- **Traza de decisión (`reflex why`)**: Home Assistant emite `processed_locally` y el `engine` que respondió, y su parser enseña la plantilla y los slots que casaron ([pipelines](https://developers.home-assistant.io/docs/voice/pipelines/), [troubleshooting](https://www.home-assistant.io/voice_control/troubleshooting/)). Apple añadió un inspector del transcript de Use Model ([WWDC26-310](https://developer.apple.com/videos/play/wwdc2026/310/)). reflex mostraría el nivel, la plantilla, los slots y la confianza. Sin esto no se confía en «se ejecutó sin LLM». **S**
- **Confirmación por verbo, con reglas allow/ask**: en Raycast cada tool declara su confirmación y puede saltarla según el caso. Auto mode pregunta antes de leer credenciales o de cualquier acción destructiva, y desde 2026 el prompt explica el impacto ([API](https://developers.raycast.com/api-reference/tool), [manual](https://manual.raycast.com/ai/ai-extensions), [changelog](https://www.raycast.com/changelog)). **M**
- **Elección en vez de sí/no, y deshacer**: App Intents ofrece `requestChoice` con estilo `.destructive` y `UndoableIntent` ([WWDC25-275](https://developer.apple.com/videos/play/wwdc2025/275/), [UndoableIntent](https://developer.apple.com/documentation/appintents/undoableintent)). En reflex: «¿Papelera o archivar?», y un `reflex undo` para mover, renombrar o mandar a la papelera. **M**

## 5. Integración con agentes

- **Anotaciones MCP como clases de riesgo**: `readOnlyHint`, `destructiveHint`, `idempotentHint` y `openWorldHint` ([resumen](https://blog.marcnuri.com/mcp-tool-annotations-introduction)). Si cada verbo del catálogo lleva su clase y se expone con ellas, el permiso de Claude Code y la confirmación de reflex dicen lo mismo. Son pistas, no garantías: reflex sigue imponiendo la suya. **S**
- **Salida `--json`/`--dry-run` con alternativas**: el `translate -n` de Kiro ya devuelve N candidatos ([report previo](research-nl-shell.md)). Un agente pide la resolución, la valida y ejecuta por ID, sin volver a parsear lenguaje natural. **S**
- **Wildcard catch-all hacia el agente**: Home Assistant enruta una frase `{question}` a otro agente ([ejemplo](https://dev.to/clarkbw--/route-all-home-assistant-voice-to-a-custom-agent-with-a-wildcard-sentence-4iee)). Ojo a su fallo conocido: dentro de una conversación continuada con el LLM, lo local deja de tener prioridad ([hilo](https://community.home-assistant.io/t/prefer-handling-commands-locally-during-continued-conversation/883012)). reflex debe resolver cada frase de forma independiente. **S**

## 6. Distribución y adopción

- **Entrar por los launchers existentes**: registrar reflex como fallback command de Raycast, que recibe `fallbackText`; el usuario tiene que activarlo a mano. reflex se usa sin cambiar de hábito. **M**
- **Un Shortcut «reflex» con entrada de texto**: así gana Quick Key en Spotlight y frase de Siri gratis, porque los Shortcuts aparecen como acciones de Spotlight ([Cult of Mac](https://www.cultofmac.com/how-to/spotlight-mac)). Hay informes de shortcuts que fallan solo desde Spotlight ([MacScripter](https://www.macscripter.net/t/changes-to-the-shortcuts-app-in-tahoe/77180)). **S**
- **Packs compartibles por git**, al estilo de la galería de Alfred o de los workflows de repo de Warp, antes de pensar en una store. **M**
- **Delegar ventanas a Hammerspoon**: `hs.urlevent` y `hammerspoon://` ([getting started](https://www.hammerspoon.org/go/)) cubren gestión de ventanas sin reimplementar nada. **S**

## Top 8 (valor / esfuerzo)

1. **`reflex why`**, traza de nivel, plantilla, slots y confianza (S)
2. **Fallback list** configurable cuando nada coincide (S)
3. **Ghost text más denylist e interruptor** para evitar falsos positivos (S)
4. **Clases de riesgo como anotaciones MCP**, compartidas con Claude Code (S)
5. **`--json`/`--dry-run`** con candidatos para agentes (S)
6. **Shortcut «reflex»**: entrada desde Spotlight y Siri gratis (S)
7. **Gramática estilo hassil** para las plantillas aprendidas (M)
8. **Confirmación con opciones más `reflex undo`** (M)

## Qué NO copiar

1. **Computer use / control de GUI** (Open Interpreter, «Send Window to AI» de Raycast): rompe el catálogo cerrado, es lento y deja de ser determinista. reflex llama a APIs y no mira la pantalla.
2. **Reimplementar el launcher** (historial del portapapeles con UI, gestor de ventanas, expansor de snippets): Raycast y Hammerspoon ya lo hacen bien y se mantienen. reflex enruta hacia ellos.
3. **Autocompletado universal de CLIs con specs al estilo Fig**: el propio Kiro CLI 3.0 retiró el autocompletado en línea el 2026-11-03 ([blog](https://kiro.dev/blog/cli-3/)). Mantener specs de todos los CLIs es un pozo sin fondo y no aporta acciones.
