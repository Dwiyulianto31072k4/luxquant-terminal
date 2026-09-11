from types import SimpleNamespace, ModuleType
import sys
from app.services import signal_screen as screen
from app.services import signal_screen_score as score

class DB:
    def __init__(self, answers): self.answers=iter(answers); self.queries=[]
    def execute(self, query, params=None):
        self.queries.append((str(query),params))
        return SimpleNamespace(fetchall=lambda:next(self.answers))

def test_preview_queries_every_selected_pair_and_enrichment_rule():
    db=DB([[('1',),('2',)]])
    assert screen._evaluate_screen({'pairs':['BTC','ETH'],'min_confidence':80},db)==['1','2']
    query,params=db.queries[0]
    assert params['pairs']==['BTCUSDT','ETHUSDT']
    assert params['min_conf']==80
    assert 'JOIN signal_enrichment' in query

def context(monkeypatch):
    monkeypatch.setattr(screen,"cache_get",lambda k:None)
    monkeypatch.setattr(screen,"cache_set",lambda *a,**k:None)
    module=ModuleType('app.api.routes.edge_lab')
    module.get_edge_correlation=lambda **kw:{'tags':[{'tag':'TEST'}],'prefer_tags':[], 'baseline':{'win_rate':80},'window':{'start':'2026-03-10','end':'2026-09-11'}}
    module.OUTCOMES_CTE='resolved AS (SELECT 1)'
    module._eb_rate=lambda *a:0.8
    module._wr=lambda *a:80
    monkeypatch.setitem(sys.modules,'app.api.routes.edge_lab',module)

def test_percentile_uses_book_before_tag_filter_and_keeps_ties(monkeypatch):
    context(monkeypatch)
    scores=[{'signal_id':str(i),'score':i if i<9 else 9} for i in range(11)]
    monkeypatch.setattr(score,'score_candidates',lambda *a:scores)
    db=DB([[('1',),('9',),('10',)],[],[]])
    assert screen._evaluate_screen({'edge_top':20,'tags':['TEST']},db)==['10','9']
    assert ':tags' in db.queries[0][0]
    assert ':tags' not in db.queries[2][0]

def test_insufficient_scored_book_does_not_invent_percentile(monkeypatch):
    context(monkeypatch)
    monkeypatch.setattr(score,'score_candidates',lambda *a:[{'signal_id':'1','score':None}])
    assert screen._evaluate_screen({'edge_top':20},DB([[('1',)],[],[]]))==['1']

def test_success_cache_includes_empty_match(monkeypatch):
    cache={};calls=[]
    monkeypatch.setattr(screen,'cache_get',cache.get)
    monkeypatch.setattr(screen,'cache_set',lambda k,v,ttl:cache.update({k:v}))
    monkeypatch.setattr(screen,'_evaluate_screen',lambda c,d:calls.append(c) or [])
    assert screen.match_screen({'pairs':['BTC']},None)==[]
    assert screen.match_screen({'pairs':['BTC']},None)==[]
    assert len(calls)==1
