//
// Gets initialized by Core.MapLoader
//

(function(){
	GTA.namespace("GTA.Core");
	//constructor
	GTA.Core.StyleParser = function(  ) {
		
		return this;
	}
	
	GTA.Core.StyleParser.prototype.ParseStyle = function(data, tileNumbers)
	{
		var ctx = this;
		
	    var style = new Object();
		var reader = new jDataView(data,0,data.length,true);
		
	    var start = reader.getString(4);
    
	    if(start != "GBST")
	        throw "File format for style file not correct";
    
	    var version = reader.getUint16();   

	    console.log("Style Map version: "+version);
    
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
                	style.sprgDataStart = reader.tell();
					style.sprgDataLength = chunkSize;				
	                break;
	            case "SPRX": //Sprite Index
		        	style.sprxDataStart = reader.tell();
					style.sprxDataLength = chunkSize;								
	                break;
	            case "PALB": //Palette Base
					style.palbDataStart = reader.tell();
					style.palbDataLength = chunkSize;	
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
	    var palx = ReadPALX(reader, style.palxDataStart, style.palxDataLength);
	    var palb = ReadPALB(reader, style.palbDataStart, style.palbDataLength);
		
		

	    var sprb = ReadSPRB(reader, style.sprbDataStart, style.sprbDataLength);
		var sprx = ReadSPRX(reader, style.sprxDataStart, style.sprxDataLength);
		
	    style.tiles = ReadTiles(reader, style.tileDataStart, style.tileDataLength, ppal, palx, tileNumbers);
		style.sprites = new Object();
		
		//See list of remaps http://projectcerbera.com/gta/2/tutorials/characters

		style.sprites.player = new Object();
		style.sprites.player.walking = new Array();
		for(i=0;i<8;i++){
			style.sprites.player.walking.push(ReadSprite(reader, style.sprgDataStart, style.sprgDataLength, sprx, palb, ppal, palx, 235+i,/* palb.ped_remap+25*/false));
		}
			//}
		
	    return style;
		
		
		
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
		
		
		function ReadPALB(reader, start, size) {
		    reader.seek(start);
		    palb = new Object();
			
			palb.tile = 0;
			palb.sprite = palb.tile+reader.getUint16();
			palb.car_remap = palb.sprite + reader.getUint16();
			palb.ped_remap = palb.car_remap + reader.getUint16();
			palb.code_obj_remap = palb.ped_remap + reader.getUint16();
			palb.map_obj_remap = palb.code_obj_remap + reader.getUint16();
			palb.user_remap = palb.map_obj_remap + reader.getUint16();
			palb.font_remap = palb.user_remap + reader.getUint16();
			
		    return palb;
		}

		function ReadSPRX(reader, start, size) {
		    reader.seek(start);
		    sprx = new Array();
			
			chunkSize = 4+2+2;
		    for (var i = 0; i < size/chunkSize; i++)
		    {
				sprxObject = new Object();
				sprxObject.ptr = reader.getUint32();
				sprxObject.w = reader.getUint8();
				sprxObject.h = reader.getUint8();
				sprxObject.pad = reader.getUint16();

				sprx.push(sprxObject);
				//console.log(sprxObject);
		    }
    
		    return sprx;
		}
		
		function ReadSPRB(reader, start, size) {
		    reader.seek(start);
		    sprb = new Object();
			
			sprb.car = 0;
			sprb.ped = sprb.car + reader.getUint16();
			sprb.code_obj = sprb.ped + reader.getUint16();
			sprb.map_obj = sprb.map_obj + reader.getUint16();
			sprb.user = sprb.user + reader.getUint16();
			sprb.font = sprb.font + reader.getUint16();
			
		    return sprb;
		}
		
		
		function ReadSprite(reader, start, size, sprx, palb, ppal, palx, spriteNumber, remap){
			var sprite = new Object();
		
			spriteIndex = sprx[spriteNumber];

			virtualPalette = spriteNumber + palb.sprite;

			if(remap == undefined || remap == false){
				remapPaletteIndex = -1;
			} else {
				remapPaletteIndex =  remap;
			}
			
			ptr = start+spriteIndex.ptr;
           
		    var pallete = palx[virtualPalette];

		    remapPalette = undefined;
			if(remapPaletteIndex != -1){
				remapPalette = palx[remapPaletteIndex];
			}
			
			if ( localStorage.getItem('sprite'+spriteNumber+"palette"+remapPaletteIndex) && GTA.Constants.CLIENT_SETTING.USE_LOCAL_CACHED_STYLE_TILES) 
			{
	            var image = new Image();
	            image.src = localStorage.getItem('sprite'+spriteNumber+"palette"+remapPaletteIndex);
			} else {
	            var canvas = createCanvas(spriteIndex.w, spriteIndex.h);
	            var context = canvas.getContext("2d");

	            for (var y = 0; y < spriteIndex.h; ++y) {
	                for (var x = 0; x < spriteIndex.w; ++x) {
						var color = reader.getUint8(ptr + (y ) * 256 + (x));
						
						
						if(remapPalette != undefined){
		                    palID = (Math.floor(remapPalette / 64)) * 256 * 64 + (remapPalette % 64) + color * 64;
		                    baseColor = ppal[palID];
							
							if(baseColor.r == 0 && baseColor.g == 0 && baseColor.b == 0){
			                    palID = (Math.floor(pallete / 64)) * 256 * 64 + (pallete % 64) + color * 64;
			                    baseColor = ppal[palID];
							}
						} else {
		                    palID = (Math.floor(pallete / 64)) * 256 * 64 + (pallete % 64) + color * 64;
		                    baseColor = ppal[palID];
						}
						
	                    drawPixel(context, x, y, baseColor); 
	                }
	            }
	            var image = new Image();
	            image.src = canvas.toDataURL("image/png");      
				//window.open(image.src,"Window"+remap, 'width='+spriteIndex.w+',height='+spriteIndex.h);
				//console.log(image.src);

				try {
					localStorage.setItem('sprite'+spriteNumber+"palette"+remapPaletteIndex,image.src);
				}
				catch(e){
					if(e.code == 22){
						console.log("Out of local storage memory. Clearing")
						localStorage.clear();
					}
				}
			
			}
			ret = new Object();
			ret.image = image;
			ret.w = spriteIndex.w;
			ret.h = spriteIndex.h
			
			return ret;
		}

		function ReadTiles(reader, start, size, ppal, palx, uniqueTileNumbers) {
		    var tiles = new Array();
		    var tilesCount = size / (64 * 64);
    
		    var cacheLoaded = 0;
		    var newLoaded = 0;
			var skipped = 0;
    
		    for (var id = 0; id < tilesCount; id++)
		    {
		        if (uniqueTileNumbers.length == 0 || $.inArray(id, uniqueTileNumbers) != -1) {
		    
					if ( localStorage.getItem('tile'+id) && GTA.Constants.CLIENT_SETTING.USE_LOCAL_CACHED_STYLE_TILES) 
					{
			            var image = new Image();
			            image.src = localStorage.getItem('tile'+id);
						cacheLoaded ++;
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
			
						try {
							localStorage.setItem('tile'+id,image.src);
						}
						catch(e){
							if(e.code == 22){
								console.log("Out of local storage memory. Clearing")
								localStorage.clear();
							}
						}
			            newLoaded++;
					} 
            
					tiles.push(image);
		        } else {
		            //Skipping tile since it's not part of the map
		            tiles.push(null);
		            skipped++;
		        }
		    }
    
			statusview.ShowAdditionalLoadingMessage("Local Cached Tiles: "+cacheLoaded);
			statusview.ShowAdditionalLoadingMessage("Generated Tiles: "+newLoaded);
			statusview.ShowAdditionalLoadingMessage("Skipped Tiles: "+skipped);
//			console.log("Loaded " + newLoaded + "tiles, skipped "+skipped);
    
		    return tiles;
		}
		
		
		
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
	}
})();

