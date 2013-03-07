
function getXHR() {
    var xhr;
    try {
        xhr = new XMLHttpRequest();
    } catch (e) {
        try {
            xhr = new ActiveXObject("MSXML2.XMLHTTP.6.0");
        } catch (e2) {
            try {
                xhr = new ActiveXObject("MSXML2.XMLHTTP");
            } catch (e3) { }
        }
    }
    return xhr;
}

function getBinaryData(url, callback) {
    var xhr = getXHR();
    xhr.open("GET", url, !!callback);
    if (callback) {
        xhr.onload = function () { callback(xhr, true) };
        xhr.onerror = function () { callback(xhr, false) };
    }
    xhr.send();

    if (typeof callback == "function") {
        return undefined;
    } else {
        return xhr.responseText;
    }
}