# Claude Code Instructions

## Regla General: Uso Obligatorio de Herramientas

Antes de escribir cualquier linea de codigo o responder cualquier pregunta tecnica, evaluar si alguna de las herramientas listadas abajo aplica. Si aplica, USARLA. No improvisar cuando hay una herramienta disponible. Si hay duda, invocar la herramienta igualmente — es mejor invocarla y descartarla que no usarla.

---

## 1. Skill: `frontend-design`

Skill de diseno frontend de nivel produccion. Genera interfaces visuales distintivas, evitando estetica generica de IA. Produce codigo listo para produccion con patrones creativos.

### Cuando usarla (OBLIGATORIO):

1. El usuario pide crear un componente UI (boton, modal, navbar, sidebar, card, tabla, formulario, header, footer)
2. El usuario pide crear una pagina completa (landing, dashboard, admin, portfolio, blog, login, signup, settings)
3. El usuario pide crear una aplicacion web, SPA o prototipo funcional
4. El usuario dice "haceme un formulario", "crea una pagina de login", "disena el header", "armame un layout"
5. El usuario pide modificar el aspecto visual de un componente existente
6. El usuario pide "mejorar el diseno", "que quede mas lindo", "darle onda", "que se vea profesional"
7. Se esta creando cualquier archivo `.tsx`, `.jsx`, `.vue`, `.svelte` o `.html` con contenido visual
8. El usuario pide un prototipo, mockup o wireframe funcional
9. Se necesita elegir tipografia, paleta de colores o estilo visual para implementacion
10. El usuario pide "hacelo responsive", "que se vea bien en mobile", "mobile first"
11. Se esta maquetando una seccion nueva de la aplicacion (hero, pricing, features, testimonials)
12. El usuario pide crear o redisenar un email template HTML

### Como invocarla:
```
/frontend-design
```

---

## 2. Skill: `ui-ux-pro-max`

Base de datos de diseno UI/UX con 67+ estilos, 96 paletas, 57 pares tipograficos, 99 guias UX, 25 tipos de graficos y reglas de razonamiento de diseno. Incluye datos para 12+ stacks (React, Next.js, Vue, Svelte, Flutter, SwiftUI, React Native, Tailwind, shadcn/ui, Astro, Nuxt, Jetpack Compose).

### Cuando usarla (OBLIGATORIO):

1. Se necesita elegir una paleta de colores para un proyecto, componente o marca
2. Se necesita elegir tipografias o pares de fuentes (heading + body)
3. El usuario pregunta por estilos: glassmorphism, neumorphism, brutalism, minimalism, claymorphism, bento grid, skeuomorphism, flat design, material design
4. Se necesita revisar accesibilidad de un componente (contraste, focus, ARIA, touch targets, screen readers)
5. El usuario pide un grafico o chart (barras, lineas, pie, radar, treemap, heatmap, scatter, funnel)
6. Se esta diseñando un dashboard, admin panel, e-commerce, SaaS o landing page
7. El usuario pregunta "que estilo le queda mejor a esto?" o "como deberia verse?"
8. Se necesitan reglas de spacing, line-height, z-index, animaciones o transiciones
9. El usuario pide "revisar la UX" o "mejorar la experiencia de usuario"
10. Se necesita elegir entre dark mode y light mode con criterio tecnico
11. El usuario pide hover effects, shadows, gradients o micro-interacciones
12. Se esta implementando un layout responsive y se necesitan breakpoints o patrones
13. Se necesita definir la jerarquia visual de una pagina o componente
14. El usuario pide iconografia o se necesita elegir un set de iconos
15. Se esta diseñando para una industria especifica (fintech, healthcare, education, etc.) y se necesitan reglas de diseno contextuales

### Como invocarla:
```
/ui-ux-pro-max
```

### Combinacion obligatoria:
Cuando se trabaja en frontend, `ui-ux-pro-max` se usa JUNTO con `frontend-design`. Primero consultar `ui-ux-pro-max` para decisiones de diseno (estilo, paleta, tipografia, UX guidelines), luego `frontend-design` para la implementacion con calidad produccion.

---

## 3. Skill: `generar-readme`

Genera o actualiza el README.md del proyecto basandose en `.planning/`, `package.json`, `.env.example`, y la estructura del codigo. Funciona con cualquier tipo de proyecto (Node.js, Go, Python, infraestructura, monorepos, skills de Claude Code).

### Cuando usarla (OBLIGATORIO):

1. El usuario dice "genera el README", "hace el README", "actualiza el README"
2. El usuario dice "documenta el proyecto", "genera la doc", "actualizá la documentación"
3. Se completo un milestone o fase significativa del proyecto
4. El usuario dice "que hace este proyecto?" y no hay README o esta desactualizado
5. Se hizo un cambio estructural grande (nuevo paquete, nueva app, cambio de arquitectura)
6. El usuario pide "preparar el repo para compartir" o "dejarlo presentable"
7. Se esta por hacer un release o deploy importante
8. El usuario dice "ponele descripcion al repo"
9. Despues de ejecutar `/gsd:complete-milestone`
10. El usuario pide documentacion y no especifica que tipo

### Como invocarla:
```
/generar-readme
```

---

## 4. Skill: `git-pushear`

Maneja el flujo completo de subir codigo a GitHub: autenticacion, remote, .gitignore, commit y push.

### Cuando usarla (OBLIGATORIO):

1. El usuario dice "pushea", "pushear", "push", "subilo a git"
2. El usuario dice "subir a github", "sincronizar repo", "subir el codigo"
3. El usuario dice "git push" o "/git-pushear"
4. El usuario dice "mandalo al repo", "actualizá el repo remoto"
5. El usuario pide configurar git en un proyecto nuevo
6. El usuario dice "commitea y pushea todo"
7. El usuario dice "subi los cambios", "mandá los cambios"
8. El usuario quiere crear un repo en GitHub y subir el proyecto
9. Despues de completar trabajo y el usuario dice "listo, subilo"
10. El usuario dice "sincronizá con origin"

### Como invocarla:
```
/git-pushear
```

---

## 5. Skill: `simplify`

Revisa el codigo cambiado en busca de reutilizacion, calidad y eficiencia. Lanza 3 agentes en paralelo: uno busca codigo duplicado o utilidades existentes que se podrian reusar, otro revisa patrones hacky (estado redundante, copy-paste, leaky abstractions), y el tercero revisa eficiencia (trabajo innecesario, concurrencia perdida, memory leaks). Corrige los problemas encontrados.

### Cuando usarla (OBLIGATORIO):

1. Se termino de escribir una cantidad significativa de codigo nuevo
2. El usuario dice "revisá el codigo", "limpiá esto", "simplificá", "optimizá"
3. Despues de implementar una feature compleja, para verificar calidad
4. El usuario pide "que no haya codigo repetido" o "que sea eficiente"
5. Se modificaron multiples archivos y se quiere verificar consistencia
6. Antes de un code review o PR, como paso de limpieza
7. El usuario dice "hacé un refactor" o "mejorá la calidad del codigo"

### Como invocarla:
```
/simplify
```

---

## 6. Skill: `claude-developer-platform`

Guia completa para construir aplicaciones con la Claude API (Anthropic SDK) y el Agent SDK. Incluye documentacion actualizada de modelos, precios, tool use, streaming, batches, Files API, code execution, structured outputs, compaction, y error handling. Detecta automaticamente el lenguaje del proyecto (Python, TypeScript, Java, Go, Ruby, C#, PHP, cURL).

### Cuando usarla (OBLIGATORIO):

1. El codigo importa `anthropic`, `@anthropic-ai/sdk`, o `claude_agent_sdk`
2. El usuario pide usar la Claude API, Anthropic SDK, o Agent SDK
3. Se necesita hacer una llamada a la API de Claude (messages, batches, files)
4. El usuario quiere construir un agente, chatbot, o aplicacion con IA usando Claude
5. Se necesita implementar tool use, function calling, o structured outputs
6. Se necesita implementar streaming de respuestas
7. Se esta trabajando con extended thinking, adaptive thinking, o effort parameter
8. Se necesita manejar errores de la API (rate limits, 400, 401, 429, 500)
9. El usuario pregunta por modelos, precios o capacidades de Claude
10. Se necesita implementar batch processing o Files API
11. Se esta construyendo un agente con el Agent SDK (Python o TypeScript)
12. Se necesita code execution server-side, web search, o computer use

### NO usarla cuando:
- El codigo importa `openai` u otro SDK de IA que no sea Anthropic
- Es programacion general sin relacion con la API de Claude
- Es trabajo de ML/data-science sin uso de la API de Claude

### Como invocarla:
```
/claude-developer-platform
```

---

## 7. Skill: `keybindings-help`

Permite personalizar los atajos de teclado de Claude Code creando o modificando `~/.claude/keybindings.json`. Conoce todos los contextos disponibles (Global, Chat, Autocomplete, Confirmation, etc.), todas las acciones disponibles, teclas reservadas, y reglas de validacion.

### Cuando usarla (OBLIGATORIO):

1. El usuario quiere cambiar un atajo de teclado de Claude Code
2. El usuario dice "rebind ctrl+s", "cambiá el shortcut de...", "quiero un atajo para..."
3. El usuario quiere agregar un chord binding (ej: ctrl+k ctrl+s)
4. El usuario pregunta "que atajos tiene Claude Code?" o "como cambio las teclas?"
5. El usuario quiere desactivar un atajo por defecto
6. El usuario tiene problemas con un atajo de teclado que no funciona
7. El usuario dice "configurar keybindings" o "personalizar shortcuts"

### Como invocarla:
```
/keybindings-help
```

---

## 8. MCP Server: `shadcn` (shadcn/ui)

Servidor MCP para buscar, ver e instalar componentes de shadcn/ui (basados en Radix). Permite explorar el registro de componentes, ver codigo fuente, ejemplos de uso, y obtener el comando de instalacion.

### Cuando usarlo (OBLIGATORIO):

1. Se va a crear o modificar CUALQUIER componente UI en este proyecto
2. El usuario menciona un componente por nombre: button, dialog, dropdown, sidebar, table, form, toast, alert, badge, avatar, etc.
3. Se necesita un componente que probablemente ya existe en shadcn (buscar primero, crear despues)
4. El usuario dice "agrega un modal", "ponele un tooltip", "necesito un select", "haceme un dropdown"
5. Se esta armando un layout con componentes estandar (Sheet, Drawer, Tabs, Accordion, Collapsible)
6. Se necesita ver como se usa un componente de shadcn con ejemplos reales
7. Se va a instalar un componente nuevo con `npx shadcn add`
8. Se esta trabajando en formularios (usar shadcn Form + react-hook-form + zod)
9. Se necesita un data table con sorting, filtering o pagination
10. El usuario pide "que componentes hay disponibles para X?"
11. Antes de crear un componente custom, verificar si shadcn ya tiene uno equivalente
12. Se necesitan variantes de un componente (sizes, variants, states)
13. Se esta creando un sidebar, navigation menu, o breadcrumb
14. Se necesita un componente de feedback (toast, sonner, alert-dialog, progress)

### Flujo de uso:
```
1. mcp__shadcn__search_items_in_registries(registries: ["@shadcn"], query: "componente")
2. mcp__shadcn__view_items_in_registries(items: ["@shadcn/componente"])
3. mcp__shadcn__get_item_examples_from_registries(registries: ["@shadcn"], query: "componente-demo")
4. mcp__shadcn__get_add_command_for_items(items: ["@shadcn/componente"])
```

### Post-instalacion:
Despues de instalar componentes o generar codigo nuevo, ejecutar:
```
mcp__shadcn__get_audit_checklist()
```

---

## 9. MCP Server: `context7`

Servidor MCP para consultar documentacion actualizada de cualquier libreria o framework. Resuelve el ID de la libreria y permite hacer queries especificas contra la documentacion oficial.

### Cuando usarlo (OBLIGATORIO):

1. Se necesita documentacion de Tailwind CSS (clases, utilidades, variantes, plugins, v4)
2. Se necesita documentacion de React (hooks, patterns, APIs, Server Components)
3. Se necesita documentacion de cualquier dependencia del proyecto (Vite, Radix, Lucide, Zod, React Hook Form, etc.)
4. No se recuerda la sintaxis exacta de una API o funcion de libreria
5. Se esta usando una feature nueva o poco comun de una libreria
6. El usuario pregunta "como se usa X en la version actual?"
7. Se necesita verificar si una API fue deprecada o cambio en la version actual
8. Se esta trabajando con Tailwind v4 y se necesitan las nuevas utilidades o sintaxis CSS
9. Se necesita documentacion de Node.js, Express, Fastify, Hono u otro runtime/framework
10. Se esta integrando una libreria nueva y se necesitan ejemplos de uso
11. Hay un error relacionado con una API de libreria y se necesita verificar el uso correcto
12. Se necesita documentacion de TypeScript, pnpm, Turborepo o herramientas de build
13. Se esta trabajando con bases de datos (Prisma, Drizzle, Supabase, MongoDB) y se necesita referencia
14. Se necesita documentacion de testing (Vitest, Jest, Playwright, Testing Library)
15. Se necesita verificar compatibilidad de versiones o migration guides

### Flujo de uso:
```
1. mcp__context7__resolve-library-id(libraryName: "nombre", query: "que necesito saber")
2. mcp__context7__query-docs(libraryId: "/org/lib", query: "pregunta especifica")
```

---

## 10. MCP Server: `playwright`

Servidor MCP para automatizacion de browser con Playwright. Opera sobre accessibility trees para interacciones y permite tomar screenshots. Abre su propia instancia de browser (no usa Chrome del usuario).

### Cuando usarlo (OBLIGATORIO):

1. Se necesita testear visualmente un componente o pagina en el browser
2. El usuario dice "probalo en el navegador", "abrilo en el browser"
3. Se necesita hacer scraping estructurado de una pagina web
4. El usuario pide automatizar una tarea en el browser
5. Se necesita verificar que un formulario funciona correctamente
6. Se esta debuggeando un problema visual o de interaccion
7. El usuario dice "navega a X y hace Y"
8. Se necesita testear responsive design en diferentes viewports (browser_resize)
9. Se necesita llenar formularios automaticamente para testing
10. Se necesita verificar que links, botones o navegacion funcionan
11. Se esta haciendo E2E testing manual de una feature
12. El usuario pide "verificá que anda bien en el browser"
13. Se necesita inspeccionar el accessibility tree de una pagina (browser_snapshot)
14. Se necesita verificar console errors o network requests despues de una accion

### Herramientas disponibles:
- `browser_navigate` — Navegar a URL
- `browser_snapshot` — Capturar accessibility tree (mejor que screenshot para interacciones)
- `browser_click` — Click en elementos
- `browser_type` — Escribir texto
- `browser_fill_form` — Llenar formularios completos
- `browser_take_screenshot` — Captura visual
- `browser_resize` — Cambiar viewport
- `browser_evaluate` — Ejecutar JavaScript
- `browser_console_messages` — Leer console logs
- `browser_network_requests` — Ver network requests

---

## 11. MCP Server: `claude-in-chrome`

Automatizacion de Chrome en tiempo real. Puede leer paginas, interactuar con elementos, tomar screenshots, ejecutar JS, leer console/network, y grabar GIFs. Trabaja con el Chrome real del usuario (con sus sesiones, cookies, extensiones).

### Cuando usarlo:

1. El usuario tiene Chrome abierto y quiere que interactue con una pagina especifica
2. Se necesita inspeccionar el DOM o accessibility tree de una pagina ya cargada en Chrome
3. El usuario pide "mirá lo que tengo abierto en el browser"
4. Se necesita llenar un formulario web en el Chrome del usuario
5. Se necesita leer contenido de una pagina ya abierta (con sesion activa)
6. El usuario pide tomar un screenshot de lo que se ve en Chrome
7. Se necesita ejecutar JavaScript en el contexto de la pagina cargada
8. El usuario pide grabar un GIF de una interaccion en el browser
9. Se necesita leer logs de consola o network requests del browser activo
10. El usuario quiere navegar a una URL y extraer informacion usando su sesion activa
11. Se necesita interactuar con una aplicacion web que requiere autenticacion (el usuario ya esta logueado)
12. El usuario pide verificar como se ve su aplicacion desplegada en produccion

### Diferencia con Playwright:
- **Playwright**: Abre browser propio, limpio, sin sesiones. Ideal para testing y scraping.
- **Claude-in-Chrome**: Usa el Chrome real del usuario. Ideal para interactuar con paginas donde el usuario ya esta autenticado.

### Inicio de sesion obligatorio:
```
mcp__claude-in-chrome__tabs_context_mcp  → Obtener tabs actuales antes de cualquier accion
```

---

## 12. Plugin: `superpowers`

Coleccion de skills de workflow avanzado para desarrollo profesional. Cada sub-skill es un proceso disciplinado que mejora la calidad del trabajo.

### Sub-skills y cuando usar cada una:

#### `superpowers:brainstorming`
**OBLIGATORIO antes de cualquier trabajo creativo:**
1. Antes de crear una feature nueva
2. Antes de disenar un componente nuevo
3. Antes de agregar funcionalidad significativa
4. Antes de modificar comportamiento existente de manera no trivial
5. Cuando el usuario dice "quiero agregar X" y la solucion no es obvia
6. Cuando hay multiples enfoques posibles y se necesita explorar opciones
7. Antes de tomar decisiones arquitecturales

#### `superpowers:systematic-debugging`
**OBLIGATORIO al encontrar bugs:**
1. Un test falla y no es obvio por que
2. Un componente no se renderiza correctamente
3. Un error en runtime que no se entiende
4. Comportamiento inesperado en el codigo
5. El usuario dice "no anda", "se rompe", "tiene un bug", "falla"
6. Un build falla con errores no triviales
7. Un problema de performance que necesita investigacion

#### `superpowers:test-driven-development`
**Usar al implementar features o bugfixes:**
1. Antes de escribir codigo de implementacion para una feature nueva
2. Antes de escribir el fix para un bug (escribir el test que falla primero)
3. El usuario pide "implementar X con tests"
4. Se necesita garantizar que el codigo funciona antes de mergear

#### `superpowers:writing-plans`
**Usar para tareas multi-step:**
1. Hay un spec o requirements y la tarea tiene 3+ pasos
2. El usuario pide algo que va a requerir cambios en multiples archivos
3. Antes de tocar codigo en tareas complejas
4. Se necesita documentar el approach antes de implementar

#### `superpowers:executing-plans`
**Usar cuando hay un plan escrito:**
1. Se genero un PLAN.md y hay que ejecutarlo
2. El usuario dice "ejecutá el plan"
3. Se necesita ejecutar un plan con checkpoints de review

#### `superpowers:subagent-driven-development`
**Usar para tareas paralelas en la sesion actual:**
1. Hay 2+ tareas independientes que pueden ejecutarse en paralelo
2. El plan tiene tasks sin dependencias entre si
3. Se quiere acelerar la implementacion dividiendo trabajo

#### `superpowers:dispatching-parallel-agents`
**Usar para despachar agentes en paralelo:**
1. Hay 2+ tareas completamente independientes
2. No comparten estado ni tienen dependencias secuenciales
3. Cada tarea puede resolverse de forma aislada

#### `superpowers:verification-before-completion`
**OBLIGATORIO antes de declarar trabajo terminado:**
1. Antes de decir "listo", "terminado", "funciona"
2. Antes de hacer commit
3. Antes de crear un PR
4. Ejecutar los comandos de verificacion y confirmar output ANTES de afirmar exito
5. Nunca afirmar que algo funciona sin evidencia — evidencia antes de afirmaciones

#### `superpowers:requesting-code-review`
**Usar al completar trabajo significativo:**
1. Se termino de implementar una feature
2. Antes de mergear a main
3. El usuario dice "revisá el codigo" o "esta bien esto?"
4. Se quiere una segunda opinion sobre la calidad del codigo

#### `superpowers:receiving-code-review`
**Usar al recibir feedback de code review:**
1. El usuario da feedback sobre el codigo
2. Antes de implementar sugerencias, verificar que son tecnicamete correctas
3. No aceptar ciegamente — usar rigor tecnico
4. El feedback parece ambiguo o tecnicamente cuestionable

#### `superpowers:finishing-a-development-branch`
**Usar al terminar implementacion:**
1. La implementacion esta completa y los tests pasan
2. Hay que decidir: merge, PR o cleanup
3. El usuario dice "ya esta todo, como lo integro?"
4. Se termino el trabajo en una branch y hay que cerrar el ciclo

#### `superpowers:using-git-worktrees`
**Usar para aislar trabajo:**
1. Se va a empezar una feature que necesita aislamiento del workspace actual
2. Antes de ejecutar un plan de implementacion largo y riesgoso
3. El usuario dice "trabajá en un worktree"
4. Se quiere evitar interferir con cambios en progreso en la branch actual

#### `superpowers:writing-skills`
**Usar para crear o editar skills:**
1. El usuario quiere crear una skill nueva para Claude Code
2. Hay que editar una skill existente
3. Verificar que una skill funciona antes de deployarla
4. Se esta trabajando con archivos SKILL.md

---

## 13. Plugin: `gsd` (Get Shit Done)

Framework de gestion de proyectos con fases, milestones, planes y ejecucion. Maneja todo el ciclo de vida de un proyecto: desde la creacion hasta el cierre de milestones.

### Comandos y cuando usar cada uno:

#### Inicio y progreso
- `/gsd:new-project` — Al iniciar un proyecto nuevo desde cero
- `/gsd:new-milestone` — Al empezar un nuevo ciclo de milestone
- `/gsd:progress` — Para ver el estado actual del proyecto y decidir que hacer. Usar al inicio de una sesion de trabajo.
- `/gsd:resume-work` — Al retomar trabajo de una sesion anterior (restaura contexto completo)
- `/gsd:pause-work` — Al pausar trabajo a mitad de una fase (crea handoff de contexto)

#### Planificacion
- `/gsd:discuss-phase` — Antes de planificar una fase, para entender el contexto a traves de preguntas adaptativas
- `/gsd:list-phase-assumptions` — Para revelar y validar asunciones antes de planificar
- `/gsd:plan-phase` — Para crear el PLAN.md detallado de una fase con loop de verificacion
- `/gsd:research-phase` — Para investigar como implementar una fase (standalone; usualmente se usa /gsd:plan-phase que incluye research)
- `/gsd:map-codebase` — Para analizar el codebase con agentes paralelos y producir documentos en .planning/codebase/

#### Ejecucion
- `/gsd:execute-phase` — Para ejecutar todos los planes de una fase con paralelizacion por waves
- `/gsd:quick` — Para tareas rapidas con garantias GSD (commits atomicos, state tracking) pero sin agentes opcionales
- `/gsd:add-tests` — Para generar tests despues de completar una fase, basados en criterios UAT
- `/gsd:validate-phase` — Para auditar retroactivamente y llenar gaps de validacion Nyquist

#### Gestion de fases
- `/gsd:add-phase` — Para agregar una fase al final del milestone actual
- `/gsd:insert-phase` — Para insertar trabajo urgente entre fases existentes (ej: fase 72.1)
- `/gsd:remove-phase` — Para eliminar una fase futura del roadmap y renumerar las siguientes

#### Verificacion y cierre
- `/gsd:verify-work` — Para validar features construidas con UAT conversacional
- `/gsd:audit-milestone` — Para auditar un milestone completo contra su intent original antes de archivar
- `/gsd:complete-milestone` — Para archivar un milestone completado y preparar el siguiente
- `/gsd:plan-milestone-gaps` — Para crear fases que cierren los gaps identificados por el audit
- `/gsd:cleanup` — Para limpiar directorios de fases acumulados de milestones completados

#### Utilidades
- `/gsd:add-todo` — Para capturar ideas o tareas como todo desde el contexto de la conversacion
- `/gsd:check-todos` — Para listar todos pendientes y seleccionar uno para trabajar
- `/gsd:health` — Para diagnosticar problemas en `.planning/` y opcionalmente repararlos
- `/gsd:debug` — Para debugging sistematico con estado persistente entre context resets
- `/gsd:settings` — Para configurar toggles del workflow y perfil de modelo
- `/gsd:set-profile` — Para cambiar entre quality/balanced/budget para los agentes GSD
- `/gsd:update` — Para actualizar GSD a la ultima version con display de changelog
- `/gsd:reapply-patches` — Para re-aplicar modificaciones locales despues de un update de GSD
- `/gsd:join-discord` — Para unirse a la comunidad Discord de GSD

---

## Flujos de Trabajo Combinados

### Crear un componente frontend nuevo
```
1. /superpowers:brainstorming          -> Explorar intent y requirements
2. /ui-ux-pro-max                      -> Elegir estilo, paleta, tipografia, UX guidelines
3. mcp__shadcn__search (buscar si ya existe)
4. mcp__context7__query-docs           -> Consultar docs de Tailwind/React si hace falta
5. /frontend-design                    -> Implementar con calidad produccion
6. mcp__shadcn__get_add_command        -> Instalar dependencias si hace falta
7. Verificar visualmente en browser (playwright o claude-in-chrome)
8. /superpowers:verification-before-completion
```

### Implementar una feature completa
```
1. /superpowers:brainstorming          -> Definir scope y approach
2. /superpowers:writing-plans          -> Planificar implementacion multi-step
3. /superpowers:test-driven-development -> Tests primero
4. /superpowers:subagent-driven-development -> Ejecutar tareas paralelas si aplica
5. /superpowers:verification-before-completion -> Verificar antes de cerrar
6. /simplify                           -> Revisar calidad, reutilizacion, eficiencia
7. /superpowers:requesting-code-review  -> Review del codigo
8. /git-pushear                        -> Subir a GitHub
```

### Completar un milestone GSD
```
1. /gsd:progress                       -> Ver estado actual
2. /gsd:plan-phase                     -> Planificar la fase pendiente
3. /gsd:execute-phase                  -> Ejecutar la fase
4. /gsd:add-tests                      -> Generar tests
5. /gsd:verify-work                    -> UAT conversacional
6. /gsd:audit-milestone                -> Auditar milestone
7. /gsd:complete-milestone             -> Archivar milestone
8. /generar-readme                     -> Actualizar documentacion
9. /git-pushear                        -> Subir todo
```

### Debuggear un problema
```
1. /superpowers:systematic-debugging   -> Debugging metodico con metodo cientifico
2. mcp__context7__query-docs           -> Verificar uso correcto de APIs
3. playwright/chrome                   -> Verificar en browser si es visual
4. /superpowers:verification-before-completion -> Confirmar que el fix funciona
```

### Construir una app con la Claude API
```
1. /superpowers:brainstorming          -> Definir que se quiere construir
2. /claude-developer-platform          -> Cargar docs de la API/SDK
3. mcp__context7__query-docs           -> Docs adicionales del stack
4. /superpowers:writing-plans          -> Planificar implementacion
5. Implementar con los patterns de la skill
6. /superpowers:verification-before-completion
```

### Limpiar y optimizar codigo existente
```
1. /simplify                           -> Revisa reutilizacion, calidad y eficiencia
2. /superpowers:verification-before-completion -> Verificar que nada se rompio
```

---

## Project-Specific Notes

### Dashboard Package Structure

- **Shared dashboard components:** `shared/dashboard/src/components/`
- **Dashboard build output:** `shared/dashboard/dist/`
- **Consumer (objetiva-sync):** `objetiva-sync/src/dashboard-react/`

### Important: Vite Resolution

In development, Vite may resolve workspace packages from source instead of dist. When modifying shared components:

1. Always rebuild shared/dashboard after changes
2. Clear Vite cache: `rm -rf node_modules/.vite`
3. Restart dev server
4. Hard refresh browser (Ctrl+Shift+R)

### Component Library

This project uses:
- **UI Components:** shadcn/ui (Radix-based)
- **Styling:** Tailwind CSS v4
- **Icons:** Lucide React

### Mandatory Checks Before Frontend Work

- [ ] Consultar shadcn MCP para referencia de componentes
- [ ] Consultar Context7 para documentacion CSS/Tailwind
- [ ] Usar ui-ux-pro-max para decisiones de diseno
- [ ] Usar frontend-design para implementacion
- [ ] Verificar visualmente en browser antes de dar por terminado
