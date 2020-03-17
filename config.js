/* eslint no-process-env: 0 */
module.exports =
{
    xchange_privkey: "",
    xchange_secret: "",
    max_btc_on_orders: 0,
    update_interval: 60, // in seconds
    markets: {
        "ETH": {
            "maxOnOrders": 0,
            "maxBtcOnOrders": 0,           //(or "all" for whatever is in the balance)
            "buyPercentageFromCurrentMarket": 5,       // in percent 5 = 5%
            "sellPercentageFromCurrentMarket": 5,
            "spreadOrders": 1,
            "spreadPercentage": 10,
            "btcPoolPercentage": 20,                  //// in percent 5 = 5%
            "maxPrice": 0.0000000
        },
        "DOGE": {
            "maxOnOrders": 0,
            "maxBtcOnOrders": 0,
            "buyPercentageFromCurrentMarket": 5,       // in percent 5 = 5%
            "sellPercentageFromCurrentMarket": 5,
            "btcPoolPercentage": 20,
            "spreadPercentage": 10,
            "spreadOrders": 1,
            "maxPrice": 0.0000000
        },
        "XMR": {
            "maxOnOrders": 0,
            "maxBtcOnOrders": 0,
            "buyPercentageFromCurrentMarket": 5,       // in percent 5 = 5%
            "sellPercentageFromCurrentMarket": 5,
            "btcPoolPercentage": 20,
            "spreadPercentage": 10,
            "spreadOrders": 1,
            "maxPrice": 0.0000000
        },
        "DASH": {
            "maxOnOrders": 0,
            "maxBtcOnOrders": 0,
            "buyPercentageFromCurrentMarket": 6,       // in percent 5 = 5%
            "sellPercentageFromCurrentMarket": -5,
            "btcPoolPercentage": 20,
            "spreadPercentage": 10,
            "spreadOrders": 1,
            "maxPrice": 0.0000000
        },
        "LTC": {
            "maxOnOrders": 0,
            "maxBtcOnOrders": 0,
            "buyPercentageFromCurrentMarket": 5,       // in percent 5 = 5%
            "sellPercentageFromCurrentMarket": 5,
            "btcPoolPercentage": 20,
            "spreadPercentage": 10,
            "spreadOrders": 3,
            "maxPrice": 0.0000000
        }
    },
    // don't change anything down here!
    priceDecimalPrecision: {
        CLAM: 6,
        LTC: 6,
        DOGE: 8,
        DGB: 7,
        ETH: 4,
        XMR: 5,
        DASH: 5,
        MAZA: 8
    },
    quantityDecimalPrecision: {
        CLAM: 2,
        LTC: 2,
        DOGE: 0,
        DGB: 1,
        ETH: 4,
        XMR: 3,
        DASH: 3,
        MAZA: 0
    },
    lotSize: {
        CLAM: 0.01,
        DOGE: 1,
        DGB: 0.1,
        LTC: 0.01,
        ETH: 0.0001,
        XMR: 0.001,
        DASH: 0.001,
        MAZA: 1
    },
    lotsPerCoin: {
        CLAM: 100,
        DGB: 10,
        DOGE: 1,
        LTC: 100,
        ETH: 10000,
        XMR: 1000,
        DASH: 1000,
        MAZA: 1
    }
};



