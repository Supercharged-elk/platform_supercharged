# Add Node — scaffold a new React Flow node type

Argument: `$ARGUMENTS` — the new node name, e.g. `upscaleNode`

## Steps

1. **Read `frontend/src/components/nodes/EditNode.tsx`** as the canonical template.

2. **Create `frontend/src/components/nodes/{NodeName}.tsx`**:
   - Props: `{ id }: NodeProps`
   - Import: `useCanvasStore`, `useAuthStore`, `cancelRun`, `executeNode`
   - State: read from `nodeStates[id]`
   - Button: idle → running → cancel flow
   - Call `fetchCredits()` in `onNodeComplete`
   - Handles: declare all `<Handle>` elements with correct `id` matching the backend response key

3. **Register in `frontend/src/components/canvas/Canvas.tsx`**:
   - Add to `nodeTypes` object: `{ ..., $ARGUMENTS: NewNode }`

4. **Export from `frontend/src/components/nodes/index.ts`**

5. **Update `frontend/src/store/canvas.ts`**:
   - Add to `getSourceDataType()` if this node emits output
   - Add to `getTargetDataType()` for each handle that accepts input

6. **Add to `frontend/src/components/canvas/Toolbar.tsx`** drag palette entry

7. **TypeScript check**: `cd frontend && npx tsc --noEmit`

## Handle naming convention

| Handle id | Data type | Direction |
|---|---|---|
| `output` | image/video/text/config | source |
| `prompt` | text | target |
| `image` | image | target |
| `config` | config | target |
| `ref_0`..`ref_N` | image | target (multiref only) |
