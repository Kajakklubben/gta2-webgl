(function(){
	GTA.namespace("GTA.Client");
	//constructor
	GTA.Client.StatusView = function(  ) {
					
		this.loadingDiv = $("#loadingMessages");

		return this;
	}
	
	
	//--------------------------------------------------
		
	GTA.Client.StatusView.prototype.ShowMessage = function(msg)
	{
		this.messageStartTime = new Date().getTime();
		
	
		if(this.additionalMessages){
			this.ShowAdditionalLoadingMessage("&nbsp;");
		}
	
	
		this.lastDiv = $("<div style='float:left;'>"+msg+"</div>");
		this.loadingDiv.append("<br>");
	
		if(this.additionalMessages){
			this.loadingDiv.append("<br>");
		}
	
	
		this.loadingDiv.append(this.lastDiv);

		this.additionalMessages = false;
	}

	GTA.Client.StatusView.prototype.ShowMessageDone= function()
	{
		var end = new Date().getTime();
		var time = end - this.messageStartTime;
		var seconds = time/1000.0;
		
		this.loadingDiv.append("<div style='float:right; color:green; font-weight:norma; margin-right:0px;'><b>Done</b> "+seconds.toFixed(1)+"sec</div>");
	}

	GTA.Client.StatusView.prototype.ShowAdditionalLoadingMessage = function(msg)
	{
		this.additionalMessages = true;		

		this.lastDiv.append("<br><span style='font-style:italic; margin-left:20px'>"+msg+"</i>");
		
	}
	
	GTA.Client.StatusView.prototype.HideView = function()
	{
		this.loadingDiv.fadeOut(200);		
	}

})();