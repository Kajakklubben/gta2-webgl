//This could be made into a class like thing

	function Skip(reader, num)
{
    reader.seek(reader.tell()+num);
}

function createCanvas(width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function ParseStyle(data, tileNumbers) {
    
    
    var style = new Object();

    var reader = new jDataView(data);

    var start = reader.getString(4);
    
    if(start != "GBST")
        throw "File format for style file not correct";
    
    var version = reader.getUint16();   

    console.log("Map version: "+version);
    
    while(reader.tell() < reader.byteLength)
    {
        var chunkType = reader.getString(4);
        var chunkSize = reader.getUint32();

        //console.log(chunkType + ":" + chunkSize);
        
        switch(chunkType)
        {
            case "TILE": // Tiles
                style.tileDataStart = reader.tell();
                style.tileDataLength = chunkSize;
                break;
            case "PPAL": //Physical Palette
                style.ppalDataStart = reader.tell();
                style.ppalDataLength = chunkSize;
                break;
            case "SPRB": //Sprite Bases
                style.sprbDataStart = reader.tell();
                style.sprbDataLength = chunkSize;
                break;
            case "PALX": //Palette Index
                style.palxDataStart = reader.tell();
                style.palxDataLength = chunkSize;
                break;
            case "OBJI": //Map Objects
                style.objiDataStart = reader.tell();
                style.objiDataLength = chunkSize;
                break;
            case "FONB": //Font Base
                break;
            case "DELX": //Delta Index
                break;
            case "CARI": //Car Info
                break;
            case "SPRG": //Sprite Graphics
                break;
            case "SPRX": //Sprite Index
                break;
            case "PALB": //Palette Base
                break;
            case "SPEC": //Undocumented
                break;
            default:
                //console.log("Skipping.");
                break;
        }
        Skip(reader, chunkSize);
    }
    
    var ppal = ReadPPAL(reader, style.ppalDataStart, style.ppalDataLength);
    var sprb = null;//ReadSPRB(reader, style.sprbDataStart, style.sprbDataLength);
    var palx = ReadPALX(reader, style.palxDataStart, style.palxDataLength);
    
    style.tiles = ReadTiles(reader, style.tileDataStart, style.tileDataLength, ppal, palx, tileNumbers);
    return style;
}

function Color(r,g,b)
{
  this.r = r;
  this.g = g;
  this.b = b;
}


function drawPixel(ctx, x, y, color) {
    imgd = ctx.getImageData(x, y, 1, 1);
    pix = imgd.data;
    pix[0] = color.r;
    pix[1] = color.g;
    pix[2] = color.b;
    if(color.r+color.g+color.b < 13)
        pix[3] = 0;
    else
        pix[3] = 255;

    ctx.putImageData(imgd, x, y);
}

function ReadPALX(reader, start, size) {
    var palx = new Array();
    reader.seek(start);
    for (var i = 0; i < 16384; i++)
    {
        palx[i] = reader.getUint16();
    }
    
    return palx;
}

function ReadPPAL(reader, start, size) {
    reader.seek(start);
    ppal = new Array();
    for (var i = 0; i < size/4; i++)
    {
        var b = reader.getUint8();
        var g = reader.getUint8();
        var r = reader.getUint8();
        var a = reader.getUint8();
        if (a != 0)
            console.log("not zero");
        
        ppal.push(new Color(r, g, b));
    
    }
    
    return ppal;
}

function ReadTiles(reader, start, size, ppal, palx, uniqueTileNumbers) {
    var tiles = new Array();
    var tilesCount = size / (64 * 64);
    
    var loaded = 0;
    var skipped = 0;
    
    for (var id = 0; id < tilesCount; id++)
    {
        if (uniqueTileNumbers.length == 0 || $.inArray(id, uniqueTileNumbers) != -1) {
		    
			if ( localStorage.getItem('tile'+id)) 
			{
	            var image = new Image();
	            image.src = localStorage.getItem('tile'+id);
			}
			else 
			{
	            var pallete = palx[id];
	            var canvas = createCanvas(64, 64);
	            var context = canvas.getContext("2d");
        
	            for (var y = 0; y < 64; ++y) {
	                for (var x = 0; x < 64; ++x) {
	                    var tileColor = reader.getUint8(start + (y + Math.floor(id/4) * 64) * 256 + (x + (id % 4) * 64));
	                    var palID = (Math.floor(pallete / 64)) * 256 * 64 + (pallete % 64) + tileColor * 64;
	                    var baseColor = ppal[palID];
	                    drawPixel(context, x, y, baseColor); 
	                }
	            }
	            var image = new Image();
	            image.src = canvas.toDataURL("image/png");      
			
				localStorage.setItem('tile'+id,image.src);
			} 
            
			tiles.push(image);
            loaded++;
        } else {
            //Skipping tile since it's not part of the map
            tiles.push(null);
            skipped++;
        }
    }
    
    console.log("Loaded " + loaded + "tiles, skipped "+skipped);
    
    return tiles;
}
	
	