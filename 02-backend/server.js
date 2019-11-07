require('array.prototype.flatmap').shim()
const express = require('express')
const bodyParser = require('body-parser');
const { Sequelize, Model, DataTypes } = require('sequelize');
const bluebird = require('bluebird')
const Redis = require('redis')
bluebird.promisifyAll(Redis);
const { Client } = require('@elastic/elasticsearch')
const app = express()
const port = 8080

app.use(bodyParser.json());

function sleep(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
}

const sequelize = new Sequelize('istioworkshop', process.env.mysql_username, process.env.mysql_password, {
  host: 'mysql',
  port: 3306,
  dialect: 'mysql'
});

const redis_master = Redis.createClient({
    host : 'redis-master',  
    no_ready_check: true,
    auth_pass: process.env.redis_password,
    retry_strategy: function (options) {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            return new Error('The server refused the connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Retry time exhausted');
        }
        return Math.min(options.attempt * 100, 3000);
    }
})
redis_master.on('error', function(e){
    console.error(e);
})

var cache = require('express-redis-cache')({
    host: 'redis-master', auth_pass: process.env.redis_password
});

const es = new Client({
    node:'https://elasticsearch-es-http:9200',
    auth: {
        username: 'elastic',
        password: process.env.elastic_password
    },
    ssl: {
        rejectUnauthorized: false
    }
})

app.get('/services/database/health', function (req, res, next) {
    sequelize
        .authenticate()
        .then(() => res.sendStatus(200))
        .catch(err => {
            console.error(err);
            res.status(500).send(err);
        });
})

app.get('/services/cache/health', function (req, res, next) {
    if (redis_master.connected) {
        try {
            redis_master.ping((err, info) => {
                if(err){
                    res.status(500).send(err);
                }
                console.log(info);
                res.sendStatus(200);
            })
        } catch (err){
            res.status(500).send(err);
        }
    } else {
        res.sendStatus(500);
    }
})

app.get('/services/search/health', async function (req, res, next) {
    try {
        const info = await es.info()
        console.log(info)
        res.sendStatus(200);
    } catch (err){
        console.error(err);
        res.status(500).send(err);
    }
})

app.post('/services/search', async function (req, res, next) {
    console.log(JSON.stringify(req.body));
    try {
        const data = await es.search({
            index: req.body.index,
            body: {
                query: req.body.query
            },
        })
        console.log(data)
        res.status(200).send(data);
    } catch (err){
        console.error(err);
        res.status(500).send(err);
    }
})

app.delete('/services/cache', function (req, res) {
    redis_master.flushall();
    res.sendStatus(200);
})

app.get('/categories/:category/products', cache.route(), async function (req, res) {
    await sleep(2000)
    Product.findAll({
        where: {
            category: req.params.category
        }
    }).then(products => {
        res.status(200).send(products)
    }).catch(error => {
        console.error(error)
        res.status(500).send(error)
    })
})

app.get('/categories', function (req, res) {
    Category.findAll()
    .then(categories => {
        res.status(200).send(categories)
    });
})

app.get('/', function (req, res) {
  res.sendStatus(200)
})

function startServer() {
    app.listen(port, () => console.log(`Listening on port ${port}!`))
}

class Category extends Model {}
Category.init({
  id: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
  name: DataTypes.STRING,
}, { sequelize, modelName: 'category' });

class Product extends Model {}
Product.init({
  id: { type:DataTypes.INTEGER, allowNull:false, primaryKey:true, autoIncrement:true },
  category: DataTypes.INTEGER,
  handle: DataTypes.STRING,
  title: DataTypes.STRING,
  body: DataTypes.STRING,
  image: DataTypes.STRING,
}, { sequelize, modelName: 'product' });

Category.hasOne(Product, { foreignKey: 'category' });

async function bulkLoadES (dataset) {
    await es.indices.create({
        index: 'products',
        body: {
            mappings: {
                properties: {
                    category: { type: 'integer' },
                    handle: { type: 'text' },
                    title: { type: 'text' },
                    body: { type: 'text' }
                }
            }
        }
    }, { ignore: [400] })
    const body = dataset.flatMap(doc => [{ index: { _index: 'products' } }, doc])
    const { body: bulkResponse } = await es.bulk({ refresh: true, body })
    if (bulkResponse.errors) {
        const erroredDocuments = []
        bulkResponse.items.forEach((action, i) => {
            const operation = Object.keys(action)[0]
            if (action[operation].error) {
                erroredDocuments.push({
                    status: action[operation].status,
                    error: action[operation].error,
                    operation: body[i * 2],
                    document: body[i * 2 + 1]
                })
            }
        })
        console.log(erroredDocuments)
    }
}

sequelize.sync({ force: true })
    .then(async () => {
        await es.indices.delete({index: '*'});
    }) 
    .then(() => Category.bulkCreate(
        [{"id":0,"name":"Apparel"},{"id":1,"name":"Home and Garden"},{"id":2,"name":"Jewelery"}]
    ))
    .then(() => Product.bulkCreate(
        [{"category":0,"handle":"ocean-blue-shirt","title":"Ocean Blue Shirt","body":"Ocean blue cotton shirt with a narrow collar and buttons down the front and long sleeves. Comfortable fit and tiled kalidoscope patterns.","image":"https://burst.shopifycdn.com/photos/young-man-in-bright-fashion_925x.jpg"},{"category":0,"handle":"classic-varsity-top","title":"Classic Varsity Top","body":"Womens casual varsity top, This grey and black buttoned top is a sport-inspired piece complete with an embroidered letter.","image":"https://burst.shopifycdn.com/photos/casual-fashion-woman_925x.jpg"},{"category":0,"handle":"yellow-wool-jumper","title":"Yellow Wool Jumper","body":"Knitted jumper in a soft wool blend with low dropped shoulders and wide sleeves and think cuffs. Perfect for keeping warm during Fall.","image":"https://burst.shopifycdn.com/photos/autumn-photographer-taking-picture_925x.jpg"},{"category":0,"handle":"floral-white-top","title":"Floral White Top","body":"Stylish sleeveless white top with a floral pattern.","image":"https://burst.shopifycdn.com/photos/city-woman-fashion_925x@2x.jpg"},{"category":0,"handle":"striped-silk-blouse","title":"Striped Silk Blouse","body":"Ultra-stylish black and red striped silk blouse with buckle collar and matching button pants.","image":"https://burst.shopifycdn.com/photos/striped-blouse-fashion_925x.jpg"},{"category":0,"handle":"classic-leather-jacket","title":"Classic Leather Jacket","body":"Womans zipped leather jacket. Adjustable belt for a comfortable fit, complete with shoulder pads and front zip pocket.","image":"https://burst.shopifycdn.com/photos/leather-jacket-and-tea_925x.jpg"},{"category":0,"handle":"dark-denim-top","title":"Dark Denim Top","body":"Classic dark denim top with chest pockets, long sleeves with buttoned cuffs, and a ripped hem effect.","image":"https://burst.shopifycdn.com/photos/young-female-models-denim_925x.jpg"},{"category":0,"handle":"navy-sport-jacket","title":"Navy Sports Jacket","body":"Long-sleeved navy waterproof jacket in thin, polyester fabric with a soft mesh inside. The durable water-repellent finish means you'll be kept comfortable and protected when out in all weathers.","image":"https://burst.shopifycdn.com/photos/mens-fall-fashion-jacket_925x.jpg"},{"category":0,"handle":"dark-winter-jacket","title":"Soft Winter Jacket","body":"Thick black winter jacket, with soft fleece lining. Perfect for those cold weather days.","image":"https://burst.shopifycdn.com/photos/smiling-woman-on-snowy-afternoon_925x.jpg"},{"category":0,"handle":"black-leather-bag","title":"Black Leather Bag","body":"Womens black leather bag, with ample space. Can be worn over the shoulder, or remove straps to carry in your hand.","image":"https://burst.shopifycdn.com/photos/black-bag-over-the-shoulder_925x.jpg"},{"category":0,"handle":"zipped-jacket","title":"Zipped Jacket","body":"Dark navy and light blue men's zipped waterproof jacket with an outer zipped chestpocket for easy storeage.","image":"https://burst.shopifycdn.com/photos/menswear-blue-zip-up-jacket_925x.jpg"},{"category":0,"handle":"silk-summer-top","title":"Silk Summer Top","body":"Silk womens top with short sleeves and number pattern.","image":"https://burst.shopifycdn.com/photos/young-hip-woman-at-carnival_925x.jpg"},{"category":0,"handle":"longsleeve-cotton-top","title":"Long Sleeve Cotton Top","body":"Black cotton womens top, with long sleeves, no collar and a thick hem.","image":"https://burst.shopifycdn.com/photos/woman-outside-brownstone_925x.jpg"},{"category":0,"handle":"chequered-red-shirt","title":"Chequered Red Shirt","body":"Classic mens plaid flannel shirt with long sleeves, in chequered style, with two chest pockets.","image":"https://burst.shopifycdn.com/photos/red-plaid-shirt_925x.jpg"},{"category":0,"handle":"white-cotton-shirt","title":"White Cotton Shirt","body":"Plain white cotton long sleeved shirt with loose collar. Small buttons and front pocket.","image":"https://burst.shopifycdn.com/photos/smiling-woman-poses_925x.jpg"},{"category":0,"handle":"olive-green-jacket","title":"Olive Green Jacket","body":"Loose fitting olive green jacket with buttons and large pockets. Multicoloured pattern on the front of the shoulders.","image":"https://burst.shopifycdn.com/photos/urban-fashion_925x.jpg"},{"category":0,"handle":"blue-silk-tuxedo","title":"Blue Silk Tuxedo","body":"Blue silk tuxedo with marbled aquatic pattern and dark lining. Sleeves are complete with rounded hem and black buttons.","image":"https://burst.shopifycdn.com/photos/man-adjusts-blue-tuxedo-bowtie_925x.jpg"},{"category":0,"handle":"red-sports-tee","title":"Red Sports Tee","body":"Women's red sporty t-shirt with colorful details on the sleeves and a small white pocket.","image":"https://burst.shopifycdn.com/photos/womens-red-t-shirt_925x.jpg"},{"category":0,"handle":"striped-skirt-and-top","title":"Striped Skirt and Top","body":"Black cotton top with matching striped skirt.","image":"https://burst.shopifycdn.com/photos/woman-in-the-city_925x.jpg"},{"category":0,"handle":"led-high-tops","title":"LED High Tops","body":"Black high top shoes with green LED lights in the sole, tied up with laces and a buckle.","image":"https://burst.shopifycdn.com/photos/putting-on-your-shoes_925x.jpg"}]
    ))
    .then((dataset) => bulkLoadES(dataset).catch(console.log))
    .then(() => Product.bulkCreate(
        [{"category":1,"handle":"clay-plant-pot","title":"Clay Plant Pot","body":"Classic blown clay pot for plants","image":"https://burst.shopifycdn.com/photos/single-sprout-in-a-pot_925x.jpg"},{"category":1,"handle":"copper-light","title":"Copper Light","body":"Stylish copper bedside light","image":"https://burst.shopifycdn.com/photos/copper-light-in-bedroom_925x.jpg"},{"category":1,"handle":"cream-sofa","title":"Cream Sofa","body":"Comfortable cream sofa with wooden base","image":"https://burst.shopifycdn.com/photos/condominium-interior-livingroom_925x.jpg"},{"category":1,"handle":"antique-drawers","title":"Antique Drawers","body":"Antique wooden chest of drawers","image":"https://burst.shopifycdn.com/photos/babys-room_925x.jpg"},{"category":1,"handle":"white-bed-clothes","title":"White Bed Clothes","body":"Sleek white bed clothes","image":"https://burst.shopifycdn.com/photos/bright-hotel-room-bed_925x.jpg"},{"category":1,"handle":"pink-armchair","title":"Pink Armchair","body":"Stylish pink armchair","image":"https://burst.shopifycdn.com/photos/soft-pink-cushioned-armchair-in-stately-salon_925x.jpg"},{"category":1,"handle":"wooden-outdoor-table","title":"Wooden Outdoor Table","body":"Chic wooden outdoor garden table","image":"https://burst.shopifycdn.com/photos/cafe-patio_925x.jpg"},{"category":1,"handle":"brown-throw-pillows","title":"Brown Throw Pillows","body":"Stylish brown throw pillows","image":"https://burst.shopifycdn.com/photos/bedroom-bed-with-brown-throw-pillows_925x.jpg"},{"category":1,"handle":"white-ceramic-pot","title":"White Ceramic Pot","body":"Homemade white ceramic flower pot","image":"https://burst.shopifycdn.com/photos/house-plant-in-white-pot_925x.jpg"},{"category":1,"handle":"yellow-watering-can","title":"Yellow watering can","body":"Vintage vibrant watering can","image":"https://burst.shopifycdn.com/photos/flowers-in-yellow-watering-can_925x.jpg"},{"category":1,"handle":"gardening-hand-trowel","title":"Gardening hand trowel","body":"Metal gardening hand trowel with wooden handle","image":"https://burst.shopifycdn.com/photos/spring-gardening-set-up_925x.jpg"},{"category":1,"handle":"biodegradable-cardboard-pots","title":"Biodegradable cardboard pots","body":"Biodegradable outdoor cardboard pots","image":"https://burst.shopifycdn.com/photos/potted-seeds_925x.jpg"},{"category":1,"handle":"grey-sofa","title":"Grey Sofa","body":"Large four seater grey sofa","image":"https://burst.shopifycdn.com/photos/large-grey-sofa-by-brick-wall_925x.jpg"},{"category":1,"handle":"wooden-outdoor-slats","title":"Wooden outdoor slats","body":"Wooden outdoor fencing slats","image":"https://burst.shopifycdn.com/photos/house-plant-on-wooden-slat-wall_925x.jpg"},{"category":1,"handle":"wooden-fence","title":"Wooden Fence","body":"Wooden garden fence","image":"https://burst.shopifycdn.com/photos/picket-fence-flowers_925x.jpg"},{"category":1,"handle":"yellow-sofa","title":"Yellow Sofa","body":"Two seater yellow sofa with wooden legs","image":"https://burst.shopifycdn.com/photos/yellow-couch-by-black-and-white-mural_925x.jpg"},{"category":1,"handle":"knitted-throw-pillows","title":"Knitted Throw Pillows","body":"Homemade knitted throw pillows in a variety of colors","image":"https://burst.shopifycdn.com/photos/yellow-sofa-with-throw-pillows_925x.jpg"},{"category":1,"handle":"vanilla-candle","title":"Vanilla candle","body":"Vanilla scent candle in jar","image":"https://burst.shopifycdn.com/photos/diy-organic-candle_925x.jpg"},{"category":1,"handle":"black-bean-bag","title":"Black Beanbag","body":"Black leather beanbag","image":"https://burst.shopifycdn.com/photos/comfortable-living-room-cat_925x.jpg"},{"category":1,"handle":"bedside-table","title":"Bedside Table","body":"Wooden bedside table","image":"https://burst.shopifycdn.com/photos/dark-wall-bedside-table_925x.jpg"}]
    ))
    .then((dataset) => bulkLoadES(dataset).catch(console.log))
    .then(() => Product.bulkCreate(
       [{"category":2,"handle":"chain-bracelet","title":"7 Shakra Bracelet","body":"7 chakra bracelet, in blue or black.","image":"https://burst.shopifycdn.com/photos/7-chakra-bracelet_925x.jpg"},{"category":2,"handle":"leather-anchor","title":"Anchor Bracelet Mens","body":"Black leather bracelet with gold or silver anchor for men.","image":"https://burst.shopifycdn.com/photos/anchor-bracelet-mens_925x.jpg"},{"category":2,"handle":"bangle-bracelet","title":"Bangle Bracelet","body":"Gold bangle bracelet with studded jewels.","image":"https://burst.shopifycdn.com/photos/bangle-bracelet-with-jewels_925x.jpg"},{"category":2,"handle":"bangle-bracelet-with-feathers","title":"Boho Bangle Bracelet","body":"Gold boho bangle bracelet with multicolor tassels.","image":"https://burst.shopifycdn.com/photos/bangle-bracelet-with-feathers_925x.jpg"},{"category":2,"handle":"boho-earrings","title":"Boho Earrings","body":"Turquoise globe earrings on 14k gold hooks.","image":"https://burst.shopifycdn.com/photos/boho-earrings_925x.jpg"},{"category":2,"handle":"choker-with-bead","title":"Choker with Bead","body":"Black choker necklace with 14k gold bead.","image":"https://burst.shopifycdn.com/photos/black-choker-with-bead_925x.jpg"},{"category":2,"handle":"choker-with-triangle","title":"Choker with Triangle","body":"Black choker with silver triangle pendant.","image":"https://burst.shopifycdn.com/photos/choker-with-triangle_925x.jpg"},{"category":2,"handle":"dainty-gold-neclace","title":"Dainty Gold Necklace","body":"Dainty gold necklace with two pendants.","image":"https://burst.shopifycdn.com/photos/dainty-gold-necklace_925x.jpg"},{"category":2,"handle":"dreamcatcher-pendant-necklace","title":"Dreamcatcher Pendant Necklace","body":"Turquoise beaded dream catcher necklace. Silver feathers adorn this beautiful dream catcher, which move and twinkle as you walk.","image":"https://burst.shopifycdn.com/photos/dreamcatcher-pendant-necklace_925x.jpg"},{"category":2,"handle":"galaxy-earrings","title":"Galaxy Earrings","body":"One set of galaxy earrings, with sterling silver clasps.","image":"https://burst.shopifycdn.com/photos/galaxy-earrings_925x.jpg"},{"category":2,"handle":"gold-bird-necklace","title":"Gold Bird Necklace","body":"14k Gold delicate necklace, with bird between two chains.","image":"https://burst.shopifycdn.com/photos/gold-bird-necklace_925x.jpg"},{"category":2,"handle":"looped-earrings","title":"Gold Elephant Earrings","body":"Small 14k gold elephant earrings, with opal ear detail.","image":"https://burst.shopifycdn.com/photos/elephant-earrings_925x.jpg"},{"category":2,"handle":"guardian-angel-earrings","title":"Guardian Angel Earrings","body":"Sterling silver guardian angel earrings with diamond gemstones.","image":"https://burst.shopifycdn.com/photos/guardian-angel-earrings_925x.jpg"},{"category":2,"handle":"moon-charm-bracelet","title":"Moon Charm Bracelet","body":"Moon 14k gold chain friendship bracelet.","image":"https://burst.shopifycdn.com/photos/womens-hand-moon-bracelet-_925x.jpg"},{"category":2,"handle":"origami-crane-necklace","title":"Origami Crane Necklace","body":"Sterling silver origami crane necklace.","image":"https://burst.shopifycdn.com/photos/origami-crane-necklace-gold_925x.jpg"},{"category":2,"handle":"pretty-gold-necklace","title":"Pretty Gold Necklace","body":"14k gold and turquoise necklace. Stunning beaded turquoise on gold and pendant filled double chain design.","image":"https://burst.shopifycdn.com/photos/pretty-gold-necklace_925x.jpg"},{"category":2,"handle":"silver-threader-necklace","title":"Silver Threader Necklace","body":"Sterling silver chain thread through circle necklace.","image":"https://burst.shopifycdn.com/photos/silver-threader-necklace_925x.jpg"},{"category":2,"handle":"stylish-summer-neclace","title":"Stylish Summer Necklace","body":"Double chained gold boho necklace with turquoise pendant.","image":"https://burst.shopifycdn.com/photos/stylish-summer-necklace_925x.jpg"}]
    ))
    .then((dataset) => bulkLoadES(dataset).catch(console.log))
    .then(() => startServer())