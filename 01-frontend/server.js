const express = require('express')
const request = require('request')
const bodyParser = require('body-parser');
const app = express()
const port = 8080

app.use(express.static('public'))
app.use(bodyParser.json());
app.disable('etag');

app.get('/services/backend/health', function (req, res, next) {
    request('http://backend', function (error, response, body) {
        if(error || response.statusCode != 200){
            res.status(500).send(body);
        } else {
            console.log(body)
            res.send(body)
        }
    });
})

app.get('/services/database/health', function (req, res, next) {
    request('http://backend/services/database/health', function (error, response, body) {
        if(error || response.statusCode != 200){
            res.status(500).send(body);
        } else {
            console.log(body)
            res.send(body)
        }
    });
})

app.get('/services/cache/health', function (req, res, next) {
    request('http://backend/services/cache/health', function (error, response, body) {
        if(error || response.statusCode != 200){
            res.status(500).send(body);
        } else {
            console.log(body)
            res.send(body)
        }
    });
})

app.get('/services/search/health', function (req, res, next) {
  request('http://backend/services/search/health', function (error, response, body) {
        if(error || response.statusCode != 200){
            res.status(500).send(body);
        } else {
            console.log(body)
            res.send(body)
        }
  });
})

app.get('/services/backend/categories/:category/products', function (req, res, next) {
  request(`http://backend/categories/${req.params.category}/products`, function (error, response, body) {
        if(error || response.statusCode != 200){
            res.status(500).send(body);
        } else {
            console.log(body)
            res.send(body)
        }
  });
})

app.get('/services/backend/categories', function (req, res, next) {
  request(`http://backend/categories`, function (error, response, body) {
        if(error || response.statusCode != 200){
            res.status(500).send(body);
        } else {
            console.log(body)
            res.send(body)
        }
  });
})

app.delete('/services/cache', function (req, res, next) {
  request.del(`http://backend/services/cache`, function (error, response, body) {
        if(error || response.statusCode != 200){
            res.status(500).send(body);
        } else {
            console.log(body)
            res.send(body)
        }
  });
})

app.post('/services/search', function (req, res, next) {
    console.log(JSON.stringify(req.body));
    request.post({
        url:'http://backend/services/search',
        body: req.body,
        json: true
    }, function (error, response, body) {
        console.log(body.body.hits.hits)
        res.status(200).send(body.body.hits.hits)
  });
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
