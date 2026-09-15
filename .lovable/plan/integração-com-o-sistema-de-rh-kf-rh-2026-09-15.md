# Integração com o sistema de RH (kf-rh)

Criar um endereço de leitura, protegido por chave, que o RH consulta para trazer os lançamentos de marmitas de um período.

## Como vai funcionar

- Endereço: `https://lflmcontrolfabricluizfelipelopes.lovable.app/api/public/rh/marmitas?inicio=2026-07-26&fim=2026-08-25`
- O RH envia em cada chamada um cabeçalho `Authorization: Bearer <chave>` com uma chave secreta gerada só para essa integração (não é a chave do banco).
- Somente leitura: o RH não consegue criar, alterar nem apagar nada.
- `fim` é inclusivo (até 23:59:59 do dia informado, horário de São Paulo).
- Mesma consulta devolve sempre o mesmo resultado e os mesmos `id` (o `id` é o do próprio lançamento no banco, então sobrevive a reimportações).
- Totais (quantidade, valor funcionário, valor empresa) calculados no servidor.
- Datas em ISO 8601 com fuso (-03:00), CPF só com dígitos, valores numéricos.
- Paginação: até 1.000 lançamentos por página; quando houver mais, `proxima_pagina` traz a URL da próxima (com `cursor`); caso contrário vem `null`.

## Ajustes necessários no sistema

O contrato pede três informações que hoje não existem no banco:

1. **`vinculo`** (clt / pj / visitante / aniversariante): novo campo no cadastro do funcionário, com seleção na tela de cadastro e edição. Padrão `clt` para quem já está cadastrado.
2. **`tipo`** em chave estável: novo campo de chave no cadastro do tipo de marmita (ex.: `normal`, `segunda_normal`, `restaurante`), separado do nome exibido. Preenchido automaticamente a partir do nome atual e editável pelo admin na tela de fornecedores.
3. **`cancelado`** e **`observacao`**: hoje não existe cancelamento nem observação de lançamento. Vão sair como `false` e `null`. Se quiser cancelamento de verdade (marcar sem apagar), tratamos como um segundo passo.

Lançamentos antigos sem tipo de marmita (92 registros) saem com `tipo: null` e `fornecedor: null`, preservando os valores gravados na época.

## Detalhes técnicos

- Rota `src/routes/api/public/rh/marmitas.ts` (TanStack server route, GET + OPTIONS com CORS), validação de `inicio`/`fim`/`cursor` com Zod.
- Autenticação: comparação em tempo constante do token recebido com o segredo `RH_API_KEY` (gerado pelo sistema); 401 sem token válido.
- Leitura via `supabaseAdmin` carregado dentro do handler, após validar a chave; junta `employees_view` (CPF já descriptografado), `meal_types` e `suppliers`; valores vêm de `unit_price`/`company_unit_price` do lançamento.
- Ordenação estável por `taken_at, id`; cursor keyset sobre esse par.
- Migração: coluna `vinculo` (enum texto com CHECK, default `clt`) em `employees`; coluna `key` (texto, único) em `meal_types` preenchida por slug do nome.
- Tela nova em `/integracao` (só admin): mostra o endereço, exemplo de chamada e permite gerar/rever a chave de acesso.
