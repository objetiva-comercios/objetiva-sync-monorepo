# Claude Code Instructions

## Frontend Development Workflow

When implementing or modifying frontend components, ALWAYS follow this workflow:

### 1. Use the `frontend-design` Skill

For any frontend implementation task, invoke the skill FIRST:
```
/frontend-design
```

This skill provides production-grade, polished frontend code.

### 2. Use shadcn MCP Server

Before implementing or modifying UI components:

1. **Search for components:**
   ```
   mcp__shadcn__search_items_in_registries(registries: ["@shadcn"], query: "sidebar")
   ```

2. **View component implementation:**
   ```
   mcp__shadcn__view_items_in_registries(items: ["@shadcn/sidebar"])
   ```

3. **Get usage examples:**
   ```
   mcp__shadcn__get_item_examples_from_registries(registries: ["@shadcn"], query: "sidebar-demo")
   ```

4. **Get install command if needed:**
   ```
   mcp__shadcn__get_add_command_for_items(items: ["@shadcn/sidebar"])
   ```

### 3. Use Context7 for Documentation

When you need documentation for Tailwind, React, or any library:

1. **Resolve library ID first:**
   ```
   mcp__context7__resolve-library-id(libraryName: "tailwindcss", query: "peer selectors data attributes")
   ```

2. **Query the documentation:**
   ```
   mcp__context7__query-docs(libraryId: "/tailwindlabs/tailwindcss", query: "peer-data selector usage")
   ```

### Mandatory Checks Before Frontend Work

- [ ] Consult shadcn MCP for component reference
- [ ] Query Context7 for relevant CSS/Tailwind documentation
- [ ] Use frontend-design skill for implementation
- [ ] Test visually in browser before considering done

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
