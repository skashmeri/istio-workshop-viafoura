const request = require('request')

function load(){
    request('http://frontend-service/services/backend/health', function (error, response, body) {
        if(error){
            console.error(error)
        } else {
            console.log(body)
        }
    });
    request('http://frontend-service/services/database/health', function (error, response, body) {
        if(error){
            console.error(error)
        } else {
            console.log(body)
        }
    });
    request('http://frontend-service/services/cache/health', function (error, response, body) {
        if(error){
            console.error(error)
        } else {
            console.log(body)
        }
    });
    request('http://frontend-service/services/search/health', function (error, response, body) {
        if(error){
            console.error(error)
        } else {
            console.log(body)
        }
    });
    request('http://frontend-service/services/backend/categories/0/products', function (error, response, body) {
        if(error){
            console.error(error)
        } else {
            console.log(body)
        }
    });
    request.post({
        url:'http://frontend-service/services/search',
        body:{"query":{"bool":{"must":[{"multi_match":{"query":"bracelet","fields":["handle","title","body"]}},{"match":{"category":2}}]}}},
        json: true
        }, function (error, response, body) {
        if(error){
            console.error(error)
        } else {
            console.log(body)
        }
    });
}

setInterval(function(){ 
    load()
 }, 1000);
