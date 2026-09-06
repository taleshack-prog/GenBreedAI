# Assets de animais (Design System §3.1 / §3.3)

Coloque os PNGs fotorrealistas aqui, no caminho:
  /assets/animals/{familia}/{especie}/default.png

Famílias: felino | canideo | sauro
Exemplos:
  apps/web/public/assets/animals/felino/panthera/default.png
  apps/web/public/assets/animals/canideo/lupus/default.png

Formato: PNG 1024×1024, fundo removido/uniforme (#0A0E14), foco no animal.
O CapsuleCard carrega automaticamente; sem o arquivo, mostra o placeholder
"aguardando síntese" (o frame do card não depende da imagem).
