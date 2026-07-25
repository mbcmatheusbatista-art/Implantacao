## Resumo das correções (roteirização)

### 1. Bug: Heraldo não aparece no mapa (sobreposição de marcador)
- **Causa**: Fabricio (cliente em Três Lagoas) tem `cityDetected=""` mas coordenadas idênticas às de Heraldo (`-20.7881,-51.7032`). O agrupamento por cidade (`Três Lagoas, MS` vs `, MS`) gerava chaves diferentes, dando offset zero a Fabricio → marcador dele EXATAMENTE em cima do de Heraldo.
- **Fix**: `roteirizacao-map.tsx:222` — agrupar por coordenadas arredondadas (`lat.toFixed(4),lng.toFixed(4)`) em vez de cidade+estado.

### 2. Performance: 50+ re-renders em cascata
- **Causa**: `setRoutes(JSON.parse(JSON.stringify(next)))` a cada chunk (20 pares) no cálculo de rotas forçava re-render do pai → cascateava para o mapa desnecessariamente.
- **Fix 1**: `roteirizacao.tsx:153` — throttle do `setRoutes` para no máximo 1x a cada 400ms (e sempre no último chunk).
- **Fix 2**: `roteirizacao-map.tsx:80` — `React.memo` no `RoteirizacaoMap` para evitar re-render quando props não mudam.

### 3. Componente remonta em StrictMode (dev only)
- React StrictMode em dev desmonta e remonta componentes. Entre os dois mounts, os dados do import chegam, então o segundo mount já recebe `techs=52, clients=122`. Não é bug real — não acontece em produção.

### Depuração adicionada
- `roteirizacao-map.tsx:143-146` — `[MAPA] Resumo pontos` e `[MAPA] Pontos:` mostram contagem e lista de pontos.
- `roteirizacao-map.tsx:261-266` — `[MAPA] Marcadores atualizados` mostra `esperado`, `noMapa`, `tecnicos[]`, `clientes[]`.

## Banco de dados (persistência)

### IndexedDB (via `idb@8`)
- **DB name**: `creare-app`, store: `appData`, key: `kind`
- **Serviço**: `src/services/db.ts` — `saveToDb`, `loadFromDb`, `loadAllFromDb`, `clearDb`
- **Disparo automático**: toda chamada a `setTechnicians`, `setConfirmedServices`, `setInitialContacts`, `toggleContacted`, `assign`, `unassign` persiste no DB
- **Hydration**: `__root.tsx` → `useEffect` chama `hydrateFromDb()` ao carregar o app, restaurando automaticamente os dados da sessão anterior
- **Clear**: `clearAll()` também limpa o IndexedDB

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
