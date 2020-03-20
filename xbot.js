const util = require('util');
const Config = require('./config');
const defer = require('co-defer')

const Poloniex = require('poloniex-api-node');
// no need to fill in apiKey or apiSecret, only xchange requests are private
const Client = require('coinbase').Client;
const client = new Client({ 'apiKey': 'empty', 'apiSecret': 'empty' });

const xchange = require('xchange-node-api')().options({
    APIKEY: Config.xchange_privkey,
    APISECRET: Config.xchange_secret,
    useServerTime: true // If you get timestamp errors, synchronize to server time at startup
});
const Binance = require('node-binance-api');
const binance = new Binance().options({
    APIKEY: '',
    APISECRET: ''
});

let poloniex = new Poloniex();


const xchangeBalance = util.promisify(xchange.balance);
//const xchangeOpenOrders = util.promisify(xchange.openOrders);
const xchangeCancelOrder = util.promisify(xchange.cancel);
const xchangeCancelOrders = util.promisify(xchange.cancelOrders);
const xchangeBuyLimit = util.promisify(xchange.buy);
const xchangeSellLimit = util.promisify(xchange.sell);
let firstrun = true

async function getTickers(currency, poloTicker) {
    let activeExchangeCount = 0
    let runningPriceSum = 0

    let poloMarketStr = "BTC_" + currency
    if (poloTicker[poloMarketStr].last && poloTicker[poloMarketStr].last > 0) {
        activeExchangeCount++
        runningPriceSum += parseFloat(poloTicker[poloMarketStr].last)
    }

    let invalidExchangeCount = 0;
    let coinbaseResult
    try {
        coinbaseResult = await coinBaseGetExRate(currency)
    } catch (err) {
        invalidExchangeCount++
    }

    if (coinbaseResult && coinbaseResult.data) {
        activeExchangeCount++
        runningPriceSum += parseFloat(coinbaseResult.data.rates["BTC"])
    }


    let bianaceMarketStr = currency + 'BTC'
    let ticker
    try {
        ticker = await binance.prices(bianaceMarketStr)
    } catch (err) {
        invalidExchangeCount++
    }

    if (ticker && ticker[bianaceMarketStr]) {
        activeExchangeCount++
        runningPriceSum += parseFloat(ticker[bianaceMarketStr])
    }

    if (invalidExchangeCount == 2) return 0
    let avg = (runningPriceSum / activeExchangeCount).toFixed(8)
    return avg
}

let currentAvgRate = {}
let onOrder = {}
let balances = {}
let minXchangeBTC = 0.0000005

async function run() {

    try {

        if (firstrun === true) {
            sanityCheck()
        }

        balances = await xchangeBalance()
        let avgRate = {}
        let updateBalances = false
        for (const currency in Config.markets) {
            let market = Config.markets[currency]
            if (firstrun === true) {
                onOrder[currency] = {}
                currentAvgRate[currency] = 0
            }

            let poloMarkets = await poloniex.returnTicker();
            avgRate[currency] = await getTickers(currency, poloMarkets)

            if (currentAvgRate[currency] !== parseFloat(avgRate[currency])) {
                let xchangeMarketStr = "BTC_" + currency
                updateBalances = true
                try {
                    await xchangeCancelOrders(xchangeMarketStr)
                } catch (e) {
                    // console.log("error cancle orders", e)
                }
            }
        }
        if (updateBalances === true) {
            balances = await xchangeBalance()
        }

        let tmp = parseFloat(balances["BTC"].available) + parseFloat(balances["BTC"].onOrder)
        let btcBalanceAvailable = parseFloat(toFixedSpecial(parseFloat(Math.floor(tmp * 1e8) / 1e8), 8))
        if (Config.max_btc_on_orders > 0 && btcBalanceAvailable > Config.max_btc_on_orders) {
            btcBalanceAvailable = Config.max_btc_on_orders
        }
        for (const currency in Config.markets) {
            let market = Config.markets[currency]
            let xchangeMarketStr = "BTC_" + currency

            let sellQuantityTotalForMarket = 0
            let btcQuantityTotalForMarket = 0

            if (parseFloat(avgRate[currency]) > 0 && parseFloat(currentAvgRate[currency]) !== parseFloat(avgRate[currency])) {
                console.log(currency, "calculating avgRate:", parseFloat(avgRate[currency]), currentAvgRate[currency])

                if (parseFloat(balances["BTC"].available !== 0)) {
                    let btcQuantityTotalForMarket = Math.floor(btcBalanceAvailable * (market.btcPoolPercentage / 100) * 1e8) / 1e8
                    if (parseFloat(btcQuantityTotalForMarket) > parseFloat(balances["BTC"].available)) {
                        btcQuantityTotalForMarket = btcBalanceAvailable
                    }
                    if (market.maxBtcOnOrders > 0 && btcQuantityTotalForMarket > market.maxBtcOnOrders) {
                        console.log("     filtering buy quantity", btcQuantityTotalForMarket, market.maxBtcOnOrders)
                        btcQuantityTotalForMarket = market.maxBtcOnOrders
                    }
                }

                if (parseFloat(balances[currency].available !== 0)) {
                    let fullpower = '1e' + Config.quantityDecimalPrecision[currency]
                    let sellQuantityTotalForMarket = Math.floor(parseFloat(balances[currency].available) * fullpower) / fullpower
                    if (market.maxOnOrders > 0 && sellQuantityTotalForMarket > market.maxOnOrders) {
                        console.log("     filtering sell quantity", sellQuantityTotalForMarket, market.maxOnOrders)
                        sellQuantityTotalForMarket = market.maxOnOrders
                    }
                }
            }

            console.log("     found max buy/sell quantities", btcQuantityTotalForMarket.toFixed(8), sellQuantityTotalForMarket, fullpower, Math.floor(parseFloat(balances[currency].available) * fullpower))

            let buyPrice = toFixedSpecial(parseFloat(avgRate[currency]) + (parseFloat(avgRate[currency]) * (market.buyPercentageFromCurrentMarket / 100)), Config.priceDecimalPrecision[currency])
            if (market.maxPrice > 0 && buyPrice > market.maxPrice) {
                console.log("     filtering buy price", buyPrice, market.maxPrice - (market.maxPrice * (market.buyPercentageFromCurrentMarket / 100)))
                buyPrice = market.maxPrice - (market.maxPrice * (market.buyPercentageFromCurrentMarket / 100))
            }

            let sellPrice = toFixedSpecial(parseFloat(avgRate[currency]) + (parseFloat(avgRate[currency]) * (market.sellPercentageFromCurrentMarket / 100)), Config.priceDecimalPrecision[currency])
            if (market.maxPrice > 0 && sellPrice > market.maxPrice) {
                console.log("     filtering sell price", sellPrice, market.maxPrice)
                buyPrice = market.maxPrice
            }

            console.log("     found buy / sell prices", buyPrice, sellPrice)
            let buyPrices = []
            let sellPrices = []
            let buyQty = []
            let sellQty = []

            if (market.spreadOrders > 1) {
                console.log("   setting up spread")

                let lowestbuyPrice = toFixedSpecial(parseFloat(buyPrice) - parseFloat(buyPrice) * (market.spreadPercentage / 100), Config.priceDecimalPrecision[currency])
                let highestSellPrice = toFixedSpecial(parseFloat(sellPrice) + parseFloat(sellPrice) * (market.spreadPercentage / 100), Config.priceDecimalPrecision[currency])

                console.log("     found lowest buy / highest sell", lowestbuyPrice, highestSellPrice)

                if (market.spreadOrders === 2) {
                    buyPrices = [parseFloat(buyPrice), parseFloat(lowestbuyPrice)]
                    sellPrices = [parseFloat(sellPrice), parseFloat(highestSellPrice)]
                } else {
                    let middleBuyPrice = toFixedSpecial((parseFloat(buyPrice) + parseFloat(lowestbuyPrice)) / 2, Config.priceDecimalPrecision[currency])
                    let middleSellPrice = toFixedSpecial((parseFloat(sellPrice) + parseFloat(highestSellPrice)) / 2, Config.priceDecimalPrecision[currency])

                    buyPrices = [parseFloat(buyPrice), parseFloat(middleBuyPrice), parseFloat(lowestbuyPrice)]
                    sellPrices = [parseFloat(sellPrice), parseFloat(middleSellPrice), parseFloat(highestSellPrice)]

                    console.log("     found middle buy / middle sell", buyPrices, sellPrices)
                }
            } else {
                buyPrices = [parseFloat(buyPrice)]
                sellPrices = [parseFloat(sellPrice)]
            }

            if (btcQuantityTotalForMarket > 0) {
                if (buyPrices.length === 1) {
                    let qty = GetQuantityFromBtcTotal(buyPrices[0], btcQuantityTotalForMarket, currency)
                    buyQty = [parseFloat(qty)]

                } else {
                    let buyBtcQtyEach = parseFloat((btcQuantityTotalForMarket / buyPrices.length).toFixed(8))
                    // check and aadjust
                    let newTotal = parseFloat((buyBtcQtyEach * buyPrices.length).toFixed(8))
                    if (newTotal > btcQuantityTotalForMarket) {
                        let difference = newTotal - btcQuantityTotalForMarket

                        for (let i = 0; i < buyPrices.length; i++) {
                            let btcquantity = (i === buyPrices.length - 1) ? buyBtcQtyEach - difference : buyBtcQtyEach
                            let qty = GetQuantityFromBtcTotal(buyPrices[i], btcquantity, currency)
                            buyQty.push(parseFloat(qty))
                        }
                    } else {

                        for (let i = 0; i < buyPrices.length; i++) {
                            let qty = GetQuantityFromBtcTotal(buyPrices[i], buyBtcQtyEach, currency)

                            //let qty = GetQuantityFromBtcTotal(sellPrices[i], sellquantity, currency)
                            buyQty.push(parseFloat(qty))
                        }
                    }
                }
            }

            if (sellQuantityTotalForMarket !== 0) {
                if (sellPrices.length === 1) {
                    sellQty = [parseFloat(toFixedSpecial(sellQuantityTotalForMarket, Config.quantityDecimalPrecision[currency]))]
                } else {

                    let sellQtyEach = parseFloat(toFixedSpecial(sellQuantityTotalForMarket / sellPrices.length, Config.quantityDecimalPrecision[currency]))
                    //let sellQtyEach = parseFloat((btcQuantityTotalForMarket / buyPrices.length).toFixed(8))
                    // check and aadjust
                    let newTotal = parseFloat(toFixedSpecial(sellQtyEach * sellPrices.length, Config.quantityDecimalPrecision[currency]))
                    if (newTotal > sellQuantityTotalForMarket) {
                        let difference = newTotal - sellQuantityTotalForMarket
                        for (let i = 0; i < sellPrices.length; i++) {
                            let sellquantity = (i === sellPrices.length - 1) ? parseFloat(toFixedSpecial(sellQtyEach - difference, Config.quantityDecimalPrecision[currency])) : sellQtyEach
                            //let qty = GetQuantityFromBtcTotal(sellPrices[i], sellquantity, currency)
                            sellQty.push(sellquantity)
                        }
                    } else {
                        for (let i = 0; i < sellPrices.length; i++) {
                            //let qty = GetQuantityFromBtcTotal(sellPrices[i], sellquantity, currency)
                            sellQty.push(sellQtyEach)
                        }
                    }
                }
            }
            console.log("     found buy / sell quantites", buyQty, sellQty)


            try {
                // final sanity check
                if (buyQty.length > 0) {
                    for (let i = 0; i < buyPrices.length; i++) {
                        console.log("trying buy order", xchangeMarketStr, buyQty[i], buyPrices[i])
                        let buy = await xchangeBuyLimit(xchangeMarketStr, buyQty[i], buyPrices[i], {})
                        console.log("          made buy order", JSON.stringify(buy))
                    }
                }

                if (sellQty.length > 0) {
                    for (let i = 0; i < sellPrices.length; i++) {
                        let sell = await xchangeSellLimit(xchangeMarketStr, sellQty[i], sellPrices[i], {})
                        console.log("          made sell order", JSON.stringify(sell))
                    }
                }
            } catch (e) {
                // console.log("buy/sell error", e)
            }


            console.log("finished", currency, buyPrices.length, sellPrices.length)
            currentAvgRate[currency] = parseFloat(avgRate[currency])
        }
    }
if (firstrun === true) {
        firstrun = false
    }
    defer.setTimeout(run, Config.update_interval * 1000)
} catch (e) {
    defer.setTimeout(run, Config.update_interval * 1000)

}
}
defer.setTimeout(run, 10)





function sanityCheck() {
    let totalBtcPercentage = 0
    for (const currency in Config.markets) {
        let market = Config.markets[currency]

        totalBtcPercentage += parseFloat(market.btcPoolPercentage)

        let buyPercentageFromCurrentMarket = parseFloat(market.buyPercentageFromCurrentMarket)
        let sellPercentageFromCurrentMarket = parseFloat(market.sellPercentageFromCurrentMarket)

        if ((sellPercentageFromCurrentMarket < 0 && buyPercentageFromCurrentMarket < 0) && buyPercentageFromCurrentMarket > sellPercentageFromCurrentMarket) {
            console.log(currency, "buy and sell percentage overlap!. would always result in buy price higher then sell price.")
            process.exit(1)
        }

        if ((sellPercentageFromCurrentMarket > 0 && buyPercentageFromCurrentMarket > 0) && buyPercentageFromCurrentMarket > sellPercentageFromCurrentMarket) {
            console.log(currency, "buy and sell percentage overlap!. would always result in buy price higher then sell price.")
            process.exit(1)
        }


        if (market.spreadOrders > 3) {
            console.log(currency, "too many spead orders: ", market.spreadOrders, ". Max is 3")
            process.exit(1)
        }
    }

    if (totalBtcPercentage > 100) {
        console.log("Your btc pool would use more then 100% of your balnace!")
        process.exit(1)
    }
}




async function coinBaseGetExRate(currency) {
    return new Promise(function (fulfilled, rejected) {
        client.getExchangeRates({ currency: currency }, function (err, buyPrice) {
            if (err) {
                return rejected(err)
            }
            fulfilled(buyPrice)
        })
    })
}


function GetQuantityFromBtcTotal(price, total, currency) {
    let buyPrice = parseFloat(price)
    let buyTotal = 0
    total = parseFloat(total)
    let cf = 1e8

    buyPrice = parseFloat(buyPrice)
    let buyPriceBig = Number(
        toFixedSpecial(Number(buyPrice * 1e8), Config.priceDecimalPrecision[currency])
    ) //Math.floor(buyPrice * cf)
    let totalBig = Math.floor(total * cf)
    let totalForOne = LotsToBtc(1, buyPriceBig, currency)
    let maxBuy = Math.floor(totalBig / totalForOne) / Config.lotsPerCoin[currency]

    let totalLots = CoinsToLots(maxBuy)
    let totalCostForNewLots = parseFloat((totalLots * totalForOne) / 1e8)
    while (totalCostForNewLots < parseFloat(minXchangeBTC)) {

        maxBuy += Config.lotSize[currency]
        totalLots = CoinsToLots(maxBuy)
        totalCostForNewLots = parseFloat((totalLots * totalForOne) / 1e8)
    }
    let buyQuantity = toFixedSpecial(
        parseFloat(maxBuy),
        Config.quantityDecimalPrecision[currency]
    )

    if (totalCostForNewLots === 'NaN') buyTotal = 0
    else
        buyTotal = toFixedSpecial(parseFloat(totalCostForNewLots), 8)

    return buyQuantity
}


// avoids any scientific notation
function toFixedSpecial(num, n) {
    var str = num.toFixed(n)
    if (str.indexOf('e+') < 0) return str

    // if number is in scientific notation, pick (b)ase and (p)ower
    return (
        str
            .replace('.', '')
            .split('e+')
            .reduce(function (p, b) {
                return p + Array(b - p.length + 2).join(0)
            }) +
        '.' +
        Array(n + 1).join(0)
    )
}

function CoinsToLots(amount, currency) {
    return Math.floor(amount / Config.lotSize[currency])
}

function LotsToBtc(lots, price, currency) {
    let remainingLots = lots // remaining lots to be converted
    let totalCost = 0

    //calculate whole lots
    if (lots >= Config.lotsPerCoin[currency]) {
        let remainder = remainingLots % Config.lotsPerCoin[currency]
        let wholeCoins = Math.floor(remainingLots / Config.lotsPerCoin[currency])
        remainingLots = 0
        if (remainder > 0) {
            remainingLots = remainder
        }

        if (wholeCoins > 0) {
            totalCost += wholeCoins * price
        }
    } else {
        remainingLots = lots
    }

    if (remainingLots > 0) {
        // multiply price in btc sat by the number of lots
        let a = price * remainingLots

        let remainder = a % Config.lotsPerCoin[currency]
        totalCost += Math.floor(a / Config.lotsPerCoin[currency])

        if (remainder != 0) {
            totalCost++
        }
    }
    return totalCost
}



