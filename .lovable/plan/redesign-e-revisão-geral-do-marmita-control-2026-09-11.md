# Redesign e revisão geral do Marmita Control

## Objetivo
Modernizar todo o sistema sem alterar as regras atuais, priorizando leitura rápida, navegação organizada e uso confortável em celular e tablet.

## Direção aprovada
- Paleta clara operacional: `#FAFBFC`, `#E8ECF1`, `#3B82F6`, `#1F2937`.
- Títulos em Sora e textos em Manrope.
- Painel administrativo limpo, com superfícies brancas, bordas discretas, cantos de até 8px e azul para ações.
- Menu lateral recolhível no tablet e computador; menu compacto e acessível no celular.

## Implementação
1. Refazer a estrutura principal com marca, usuário conectado, saída e navegação separada entre Operação e Administração.
2. Reorganizar a tela inicial com resumo de funcionários, retiradas de hoje e do mês, além de uma ação clara para registrar retirada.
3. Criar padrões visuais compartilhados para títulos, indicadores, listas, formulários, estados vazios e carregamento, refletindo-os nas telas existentes.
4. Corrigir o excesso de itens no rodapé móvel, textos cortados, dimensões instáveis e espaçamentos inconsistentes.
5. Revisar fluxos e falhas concretas encontrados no código, preservando permissões, relatórios, assinaturas e regras do banco.
6. Adicionar títulos e descrições próprios para cada tela, mantendo o sistema acessível e instalável.
7. Validar a navegação e as telas principais em celular e tablet, além de verificar erros de execução e compilação.

## Limites
- Nenhuma regra de negócio ou dado existente será removido.
- A revisão não mudará permissões nem cálculos, salvo correção comprovada de erro.
- A imagem enviada será usada apenas como referência do problema atual.
