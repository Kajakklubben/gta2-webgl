(function(){
	GTA.namespace("GTA.Server");
	//constructor
	GTA.Server.StatusView = function(  ) {
					
		return this;
	}
	
	
	//--------------------------------------------------
		
	GTA.Server.StatusView.prototype.ShowMessage = function(msg)
	{
		this.messageStartTime = new Date().getTime();
		
		console.log(msg);

	}

	GTA.Server.StatusView.prototype.ShowMessageDone= function()
	{
		var end = new Date().getTime();
		var time = end - this.messageStartTime;
		var seconds = time/1000.0;
		
		console.log("Done "+seconds.toFixed(1)+"sec");
	}

	GTA.Server.StatusView.prototype.ShowAdditionalLoadingMessage = function(msg)
	{
		this.additionalMessages = true;		
		console.log("....."+msg);
	}

	GTA.Server.StatusView.prototype.HideView = function(){

	}
	
})();