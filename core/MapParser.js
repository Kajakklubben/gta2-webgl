//
// Gets initialized by Core.MapLoader
//

(function(){
	GTA.namespace("GTA.Core");
	//constructor
	GTA.Core.MapParser = function(  ) {
		
		return this;
	}
	
	GTA.Core.MapParser.prototype.ReadFromData = function(data, littleEndian)
	{
		var reader = new jDataView(data,0,data.length,littleEndian); //Little endian required by server
		
		var start = reader.getString(4);
		if(start != "GBMP")
			throw "File format for map file not correct";
	
		var version = reader.getUint16();	

		console.log("Map version: "+version);
	
		while(reader.tell() < reader.byteLength)
		{		
			//console.log(reader.tell())
			var chunkType = reader.getString(4);
			var chunkSize = reader.getUint32();

			switch(chunkType)
			{
				case "DMAP":
					console.log("Reading '" + chunkType + "' (" + chunkSize + ")");
					this.map = ReadDMAP(reader);
					break;			
				default:
					console.log("Skipping '" + chunkType + "' (" + chunkSize+")");
					Skip(reader, chunkSize);
					break
			}
		}
		
		
		
		function Skip(reader, num)
		{
			reader.seek(reader.tell()+num);
		}

		function ReadDMAP(reader)
		{
			var baseOffsets = new Array();	
			for (var i = 0; i < 256; i++)
			{
				baseOffsets[i] = new Array();
		
				for (var j = 0; j < 256; j++)
				{
					baseOffsets[i][j] = reader.getUint32();
				}
			}
	
			var columnCount = reader.getUint32();
			var columns = new Array();
	
			for (var i = 0; i < columnCount; i++)
			{
				columns[i] = reader.getUint32();
			}
	
			var blockCount = reader.getUint32();
			var blocks = new Array();
	
			for (var i = 0; i < blockCount; i++)
			{
				var blockInfo = new BlockInfo();	
		
				blockInfo.Left = new BlockFaceEdge(reader.getUint16());
				blockInfo.Right = new BlockFaceEdge(reader.getUint16());
				blockInfo.Top = new BlockFaceEdge(reader.getUint16());
				blockInfo.Bottom = new BlockFaceEdge(reader.getUint16());
				blockInfo.Lid = new BlockFaceLid(reader.getUint16());
				blockInfo.Arrows =	reader.getUint8(); 
				blockInfo.ParseSlope(reader.getUint8());		
				blocks[i] = blockInfo;	
			}

			var cityBlocks = CreateUncompressedMap(baseOffsets, columns, blocks);
			return cityBlocks;
		}

		FaceType = {
			Left:0, Right:1, Top:2, Bottom:3, Lid:4
		}

		function CreateUncompressedMap(baseOffsets, columns, blocks)
		{
			var cityBlocks = new Array();
	
			for (var i = 0; i < 256; i++)
			{
				cityBlocks[i] = new Array();
		
				for (var j = 0; j < 256; j++)
				{
					cityBlocks[i][j] = new Array();	
			
					var columnIndex = baseOffsets[j][i];
					var height = columns[columnIndex] & 0xFF;
					var offset = (columns[columnIndex] & 0xFF00) >> 8;
			
					for (var k = 0; k < height; k++)
					{
						if (k >= offset)
						{
							cityBlocks[i][j][k] = blocks[columns[columnIndex + k - offset + 1]];
						}
					}
				}
			}
	 
			return cityBlocks;
		}

		function BlockInfo()
		{
			this.ParseSlope = function(type)
			{	
				this.baseSlopeType = type;
	
				if (type == 0) return;
	
				var groundType = 0;
				groundType += (type & 1);
				groundType += (type & 2);
				this.groundType = groundType;
	
				if (type < 4) return;
	
				var slopeType = 0;
				for (var i = 2; i < 8; i++)
				{
					if (CheckBit(type, i))
						slopeType += Math.pow(2, i - 2);
				}
		
				this.slopeType = slopeType;
	
				//make some corrections to the collision bits.
				switch (slopeType)
				{
					case SlopeType.DiagonalFacingUpLeft:
					case SlopeType.DiagonalFacingDownLeft:
						this.Left.Wall = true;
						this.Left.BulletWall = true;
						break;
					case SlopeType.DiagonalFacingUpRight:
					case SlopeType.DiagonalFacingDownRight:
						this.Right.Wall = true;
						this.Right.BulletWall = true;
						break;
				}
			}
		}


		function BlockFace(value)
		{
			if(value == 0) return;
	
			 //parse ushort value
			//Bits 0-9: Tile number
			var tile = 0;
	
			for (var i = 0; i < 10; i++)
			{
				tile = tile + (value & Math.pow(2, i));
			}
	
			this.tileNumber = tile;
	
			this.flat = CheckBit(value, 12); //Bit 12
			this.flip = CheckBit(value, 13); //Bit 13

			var bit14 = CheckBit(value, 14);
			var bit15 = CheckBit(value, 15);
	
			if (!bit14 && !bit15)
				this.rotation = BlockFaceRotation.None;
		
			if (bit14 && !bit15)
				this.rotation = BlockFaceRotation.R90;
		
			if (!bit14 && bit15)
				this.rotation = BlockFaceRotation.R180;
		
			if (bit14 && bit15)
				this.rotation = BlockFaceRotation.R270;

		}

		function BlockFaceEdge(value)
		{
			this.inheritFrom = BlockFace;
			this.inheritFrom(value);

			this.wall = CheckBit(value, 10);
			this.bulletWall = CheckBit(value, 11);
		}

		function BlockFaceLid(value)
		{    
			this.inheritFrom = BlockFace;
			this.inheritFrom(value);
	
			var bit10 = CheckBit(value, 10);
			var bit11 = CheckBit(value, 11);
	
			if (!bit10 && !bit11)
				this.LightningLevel = 0;
		
			if (bit10 && !bit11)
				this.LightningLevel = 1;
		
			if (bit10 && bit11)
				this.LightningLevel = 2;
		
			if (bit10 && bit11)
				this.LightningLevel = 3;
		}

		function CheckBit(value, bitOffset)
		{
			if (bitOffset > 31)
			{
				throw "Not supported (CheckBit)";
			}
	
			var bitValue = Math.pow(2, bitOffset);
			return (value & bitValue) == bitValue;
		}
	}
	

})();



BlockFaceRotation = {
	None:0, R90:90, R180:180, R270:270
}

BlockFaceDirection = {
	Left:0, Right:1, Top:2, Bottom:3, Lid:4
}


SlopeType = {
	None:0,
	Up26Low:1,
	Up26High:2,
	Down26Low:3,
	Down26High:4,
	Left26Low:5,
	Left26High:6,
	Right26Low:7,
	Right26High:8,
	Up7Low:9,
	Up7High0:10,
	Up7High1:11,
	Up7High2:12,
	Up7High3:13,
	Up7High4:14,
	Up7High5:15,
	Up7High6:16,
	Down7Low:17,
	Down7High0:18,
	Down7High1:19,
	Down7High2:20,
	Down7High3:21,
	Down7High4:22,
	Down7High5:23,
	Down7High6:24,
	Left7Low:25,
	Left7High0:26,
	Left7High1:27,
	Left7High2:28,
	Left7High3:29,
	Left7High4:30,
	Left7High5:31,
	Left7High6:32,
	Right7Low:33,
	Right7High0:34,
	Right7High1:35,
	Right7High2:36,
	Right7High3:37,
	Right7High4:38,
	Right7High5:39,
	Right7High6:40,
	Up45:41,
	Down45:42,
	Left45:43,
	Right45:44,
	DiagonalFacingUpLeft:45,
	DiagonalFacingUpRight:46,
	DiagonalFacingDownLeft:47,
	DiagonalFacingDownRight:48,
	DiagonalSlopeFacingUpLeft:49, //there 2 versions of these, see documentation, check if they require a different behaviour.
	DiagonalSlopeFacingUpRight:50, //as above
	DiagonalSlopeFacingDownLeft:51, //as above
	DiagonalSlopeFacingDownRight:52, //as above
	PartialBlockLeft:53, //24 pixels
	PartialBlockRight:54, //24 pixels
	PartialBlockTop:55, //24 pixels
	PartialBlockBottom:56, //24 pixels
	PartialBlockTopLeft:57, //24 pixels
	PartialBlockTopRight:58, //24 pixels
	PartialBlockBottomRight:59, //24 pixels
	PartialBlockBottomLeft:60, //24 pixels
	PartialCentreBlock:61, //16 pixels
	//62 unused
	SlopeAbove:63
}