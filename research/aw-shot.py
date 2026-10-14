import json, sys, asyncio
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
out = sys.argv[1]; dest = sys.argv[2]
meta = json.load(open(f"{out}/meta.json"))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/chromium")
        pg = await b.new_page(viewport={"width":2560,"height":1440})
        for m in meta:
            svg = open(m["file"]).read()
            await pg.set_content(f'<html><body style="margin:0">{svg}</body></html>')
            await pg.screenshot(path=m["file"].replace(".svg",".png"))
        await b.close()
asyncio.run(main())
tw, th = 640, 360; cols = 4
rows = (len(meta)+cols-1)//cols
sheet = Image.new("RGB",(cols*tw, rows*(th+24)),(255,255,255))
d = ImageDraw.Draw(sheet)
for i,m in enumerate(meta):
    im = Image.open(m["file"].replace(".svg",".png")).convert("RGB").resize((tw,th), Image.LANCZOS)
    x=(i%cols)*tw; y=(i//cols)*(th+24)
    sheet.paste(im,(x,y+24)); d.text((x+6,y+5),f'{m["name"]}  {m["bytes"]/1024:.1f}KB',fill=(0,0,0))
sheet.save(dest)
print(dest, sheet.size)
