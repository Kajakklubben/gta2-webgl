
(function(){
	GTA.Constants = {
		DEBUG_SETTING:
		{
			SERVER_DEBUG : true,
			CLIENT_DEBUG : true,
			
			DRAW_COLLISION_MAP : false,
			
		},
		
		CLIENT_SETTING:
		{
			START_CAM_POSITION : [85, -190],
			LOAD_TEXTURES 	: true,
			SHOW_WIREFRAME 	: false,
			
			LOAD_LEVEL_AREA : 		[0,       // minY
			                        0,      // minX
			                        256,      // maxY
			                        256],     // maxX
									
			USE_LOCAL_CACHED_STYLE_TILES : true,
									
			
		},

		SERVER_SETTING:
		{
			
			SOCKET_DOMAIN	: window.location.hostname + ":81/server/server.js",
			SOCKET_PORT		: 81,

		
		},

		RENDER_SETTING: 
		{
			CAM_STANDARD_HEIGHT : 400,
		},

		// The client sends this bitmask to the server
		// See (Keyboard.js)
		INPUT_BITMASK:
		{
			UP		: 1 << 0,
			DOWN	: 1 << 1,
			LEFT	: 1 << 2,
			RIGHT	: 1 << 3,
			SPACE	: 1 << 4,
			SHIFT	: 1 << 5,
			TAB		: 1 << 6
		},

		MESSAGE_TYPES:
		{
			INPUT 				: '0',
			SYNC				: '1',
			ADDPLAYER 			: '2',
			ADDCLIENTPLAYER		: '3',
			REMOVEPLAYER		: '4',
			STARTSYNC			: '5'
		},

		PLAYER:
		{
			MOVESPEED 		: 170,
			ROTATIONSPEED	: 0.12
			
		}

	}
})();