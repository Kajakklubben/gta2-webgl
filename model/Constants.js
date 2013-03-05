
(function(){
	GTA.Constants = {
		DEBUG_SETTING:
		{
			SERVER_DEBUG : true,
			CLIENT_DEBUG : true
		},

		SERVER_SETTING:
		{
			
			SOCKET_DOMAIN	: "localhost",
			SOCKET_PORT		: 8081,

		
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
			INPUT 			: '0',
			SYNC			: '1',
			ADDPLAYER 		: '2',
			ADDCLIENTPLAYER	: '3' 
		},

		PLAYER:
		{
			MOVESPEED 		: 100
		}

	}
})();