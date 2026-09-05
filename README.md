# VOLTEX — Precificador 3D Shopee

Site estático que reproduz a lógica da planilha `Planilha_Precificacao_3D_Shopee_2026.xlsx`.

## Como usar
1. Abra `index.html` no navegador.
2. Edite custos, margem e dados do produto.
3. O preço sugerido, lucro e taxas são recalculados automaticamente.
4. Use **Salvar / atualizar produto** para montar um catálogo local.
5. Dados ficam no `localStorage` do navegador e podem ser exportados/importados em JSON.

## Publicação
Pode ser hospedado gratuitamente em GitHub Pages, Netlify, Vercel ou Cloudflare Pages, pois não exige backend.

## Observação
As regras da Shopee podem mudar. O site replica as faixas usadas na planilha criada em 05/09/2026.

## Calculadora integrada
- Abre pelo botão **Calculadora** no topo do site.
- No celular, há um botão flutuante de acesso rápido.
- Suporta soma, subtração, multiplicação, divisão, percentual, troca de sinal e teclado físico.
- O resultado pode ser aplicado diretamente em campos do precificador, como preço de venda, filamento, embalagem, frete e mão de obra.
