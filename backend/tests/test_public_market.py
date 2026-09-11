import asyncio
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from app.services import public_market as market

@pytest.mark.parametrize('provider,path,params', [
 ('bad','/fapi/v1/klines',{'symbol':'BTCUSDT'}),
 ('binance-futures','/fapi/v1/order',{'symbol':'BTCUSDT'}),
 ('bybit','/v5/market/kline',{'symbol':'BTCUSDT','api_key':'no'}),
 ('bybit','/v5/market/kline',{'symbol':'https://example.org'}),
 ('bybit','/v5/market/kline',{'symbol':'BTCUSDT','limit':'1001'}),
])
def test_rejects_non_public_or_unbounded_requests(provider,path,params):
    with pytest.raises(HTTPException) as err:
        market.validate_request(provider,path,params)
    assert err.value.status_code == 400

def test_unicode_instrument():
    market.validate_request('bybit','/v5/market/kline',{'symbol':'牛来USDT','limit':'25'})

def test_coalesces_and_caches_success(monkeypatch):
    cache, calls = {}, []
    monkeypatch.setattr(market,'cache_get',cache.get)
    monkeypatch.setattr(market,'cache_set',lambda k,v,ttl:cache.update({k:v}))
    async def get(url,**kwargs):
        calls.append(url)
        await asyncio.sleep(0)
        return SimpleNamespace(status_code=200,json=lambda:{'retCode':0,'result':{'list':[]}})
    monkeypatch.setattr(market,'get_general_client',lambda:SimpleNamespace(get=get))
    async def run():
        args=('bybit','/v5/market/kline',{'symbol':'BTCUSDT'})
        a,b=await asyncio.gather(market.exchange_data(*args),market.exchange_data(*args))
        assert a==b==await market.exchange_data(*args)
    asyncio.run(run())
    assert len(calls)==1
    assert not market._pending

def test_failure_is_not_cached(monkeypatch):
    monkeypatch.setattr(market,'cache_get',lambda k:None)
    monkeypatch.setattr(market,'cache_set',lambda *a,**k:pytest.fail('Failed response cached'))
    async def get(*a,**k):return SimpleNamespace(status_code=200,json=lambda:{'retCode':10001})
    monkeypatch.setattr(market,'get_general_client',lambda:SimpleNamespace(get=get))
    with pytest.raises(HTTPException) as err:
        asyncio.run(market.exchange_data('bybit','/v5/market/kline',{'symbol':'BTCUSDT'}))
    assert err.value.status_code==502
    assert not market._pending
