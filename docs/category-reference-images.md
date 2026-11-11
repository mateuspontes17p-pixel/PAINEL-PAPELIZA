# Fotos ilustrativas das categorias — Lápis de Cor

As categorias existentes foram preservadas. Apenas a apresentação da vitrine lilás recebeu fotos circulares com os nomes abaixo. O filtro original continua no mesmo botão.

| Categoria atual | Arquivo gerado |
| --- | --- |
| Acessórios | estojos-v1.png |
| Cadernos | cadernos-v1.png |
| Escrita | canetas-v1.png |
| Presentes | agendas-planners-v1.png |
| lapis | lapis-v1.png |
| Materiais Juliana utrera | organizadores-v1.png |

Os arquivos estão em `public/vitrine/assets/categorias/`. O navegador recebe miniaturas WebP de 320 × 320 pelo Netlify Image CDN, com fallback para o PNG original. A foto é decorativa para acessibilidade; o nome do botão continua vindo do cadastro real.

A aplicação é específica da vitrine Lápis de Cor. Não altera o painel, o banco ou a vitrine London. `category-photos.js` aplica o mapa pelo nome normalizado, depois de carregar as categorias. Uma categoria desconhecida recebe a foto genérica de organizadores. Se o renderizador já trouxer uma imagem, ela é preservada, permitindo a futura integração das imagens cadastradas no painel.

Enviar, trocar e remover a imagem pelo painel permanece uma melhoria separada. Estes PNGs não estão cadastrados como fotos de categorias no Supabase.

## Geração

Ferramenta nativa de geração de imagens. Referências fornecidas pelo usuário usadas para tema, composição e clima; imagens novas, sem copiar logotipos ou personagens das fotos originais. Todas são ilustrativas.

Direção dos prompts: fotografia editorial quadrada e realista de produtos de papelaria, luz natural suave, fundo em tons pastel, materiais com textura, composição central legível dentro de um recorte circular, sem texto, marca ou marca-d'água.

Assuntos: planner floral rosa com agenda azul e caneta menta; canetas pastel em leque; cadernos rosa, azul e lilás com estrelas e xadrez; estojo coral com zíper turquesa; aquarela de doze cores; blocos adesivos em coração; organizadores de mesa pastel; borrachas divertidas; leque de lápis de cor.

O conjunto completo de nove originais foi salvo em `C:/Users/julia/Documents/Codex/outputs/imagens-categorias-papeliza/`. Somente os seis arquivos necessários às categorias atuais entram na publicação.
