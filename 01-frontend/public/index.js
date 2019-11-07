function serviceHealthcheck() {
	axios.get('/services/backend/health')
		.then(function(response) {
			app.services[0].health = "btn-success"
		})
		.catch(function(error) {
			console.error(error);
			app.services[0].health = "btn-danger"
		});

	axios.get('/services/database/health')
		.then(function(response) {
			app.services[1].health = "btn-success"
		})
		.catch(function(error) {
			console.error(error);
			app.services[1].health = "btn-danger"
		});

	axios.get('/services/cache/health')
		.then(function(response) {
			app.services[2].health = "btn-success"
		})
		.catch(function(error) {
			console.error(error);
			app.services[2].health = "btn-danger"
		});

	axios.get('/services/search/health')
		.then(function(response) {
			app.services[3].health = "btn-success"
		})
		.catch(function(error) {
			console.error(error);
			app.services[3].health = "btn-danger"
		});
}

function purgeCache() {
	axios.delete(`/services/cache`)
		.then(()=>{})
		.catch(function(error) {
			console.error(error);
		});
}

getCategories = async () => {
    try {
        let res = await axios.get('/services/backend/categories')
        let data = res.data;
        app.categories = data;
        return data
    } catch (error) {
        console.error(error.response)
        return error
    }
}

/*
curl -u elastic:password -X GET -k "https://elasticsearch-es-http:9200/_search?pretty" -H 'Content-Type: application/json' -d'
{
  "query": {
        "bool": {
            "must": [{
                "multi_match" : {
                    "query":    "bracelet", 
                    "fields": [ "handle", "title", "body" ] 
                }
            },{
                "match": {
                    "category": 2
                }
            }]
        }
    }
}
'
*/

fuzzySearch = async (str, cat) => {
    let res = await axios.post('/services/search', {
        index: 'products',
        query: {
            "bool": {
                "must": [{
                    "multi_match" : {
                        "query":    str, 
                        "fields": [ "handle", "title", "body" ],
                        "fuzziness": "AUTO"
                    }
                },{
                    "match": {
                        "category": parseInt(cat)
                    }
                }]
            }
        }
    })
    app.filter = _.pluck(_.pluck(res.data, '_source'),'id')
}
let fuzzysearchinput;
document.addEventListener("DOMContentLoaded", function(event) { 
  fuzzysearchinput = document.querySelector('#fuzzysearch')
    .addEventListener('input', (evt) => {
        let cat = window.location.href.split('/')[window.location.href.split('/').indexOf("categories")+1]
        fuzzySearch(evt.target.value, cat)
    });
});

getProducts = async (category) => {
    try {
        let res = await axios.get(`/services/backend/categories/${category}/products`)
        let data = res.data;
        app.products = data;
        return data
    } catch (error) {
        console.error(error.response)
        return error
    }
}

Vue.component('service-status', {
	name: "service-status",
	props: ['services'],
	template: '\
    <div class="d-flex status-row">\
        <button type="button" class="btn btn-status" :class="services.health" disabled >{{services.service}}</button>\
    </div>\
    '
})

Vue.component('category-li', {
	name: "category-li",
	props: ['categories'],
	template: '\
    <router-link :to="`/categories/` + categories.id + `/products/`"><a href="" class="list-group-item list-group-item-action" v-bind:class="[{ active: $route.params.category == categories.id}]">{{categories.name}}</a></router-link>\
    '
})

const product_card = Vue.component('product-card', {
    props: ['products', 'filter'],
	name: "product-card",
	template: '\
    <div class="card" style="width: 18rem;">\
    <img class="card-img-top" :src="products.image" alt="Card image cap">\
    <div class="card-body">\
    <h5 class="card-title">{{products.title}}</h5>\
    <p class="card-text">{{products.body}}</p>\
    </div>\
    </div>\
    '
})

const product_grid = {
    name:'product_grid',
	template: '\
    <div class="row" style="margin-right:-10px;margin-left:-10px;">\
        <product-card\
            v-for="product in filtered"\
            v-bind:products="product"\
            v-bind:key="product.id"\
        ></product-card>\
    </div>\
    ',
    methods: {
        async fetchData () {
            let prods = await getProducts(this.$route.params.category)
            this.$parent.filter = [];
            document.querySelector('#fuzzysearch').value = '';
        }
    },
    created () {
        this.fetchData()
    },
    watch: {
        '$route': 'fetchData'
    },
    computed: {
        filtered: function(){
            if (this.$parent.filter.length > 0) {
                return this.$parent.products.filter(p => this.$parent.filter.indexOf(p.id) != -1)
            } else {
                return this.$parent.products
            }
        }
    }
}

const routes = [
    {path: '/categories/:category/products', component: product_grid},
    {path: '/', redirect: '/categories/0/products'},
]

const router = new VueRouter({
	routes
})

const app = new Vue({
	router,
	data: {
		services: [
            { id: 0, service: 'backend', health: 'btn-warning', dns: 'backend-service.default.svc.cluster.internal' },
			{ id: 1, service: 'database', health: 'btn-warning', dns: 'database-service.default.svc.cluster.internal' },
			{ id: 2, service: 'cache', health: 'btn-warning', dns: 'cache-service.default.svc.cluster.internal' },
			{ id: 3, service: 'search', health: 'btn-warning', dns: 'search-service.default.svc.cluster.internal' },
		],
		categories: [],
        products: [],
        filter: []
	}
}).$mount('#app')

serviceHealthcheck()
getCategories()