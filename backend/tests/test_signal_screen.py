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
    module.outcomes_cte=lambda as_of=False: module.OUTCOMES_CTE
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



def desk(monkeypatch, scored, members, tags=('A', 'B'), top=frozenset()):
    cache = {}
    monkeypatch.setattr(screen, 'cache_get', cache.get)
    monkeypatch.setattr(screen, 'cache_set', lambda k, v, ttl: cache.update({k: v}))
    monkeypatch.setattr(screen, '_scored_book', lambda db: scored)
    monkeypatch.setattr(screen, 'runner_members', lambda db: members)
    monkeypatch.setattr(screen, 'cache_single_flight', lambda key, ttl, compute, keep=None: compute())
    monkeypatch.setattr(screen, '_top_runner_ids', lambda db: top)
    module = ModuleType('app.api.routes.edge_lab')
    module.get_tag_wr = lambda **kw: {'tags': [{'tag': t} for t in tags]}
    monkeypatch.setitem(sys.modules, 'app.api.routes.edge_lab', module)
    recipe = ModuleType('app.services.hunt_recipe')
    recipe.select_runner_tags = lambda ts: ts
    monkeypatch.setitem(sys.modules, 'app.services.hunt_recipe', recipe)
    return screen.desk_edge(None)


def test_desk_lists_the_members_that_are_in_the_book(monkeypatch):
    scored = [{'signal_id': s, 'score': 50 + i} for i, s in enumerate(
        ['posted', 'rejected', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8'])]
    out = desk(monkeypatch, scored, members=['posted', 'rolled-out-of-book'])
    assert out['runners']['ids'] == ['posted']
    assert out['runners']['tags'] == ['A', 'B']
    assert out['edge']['posted']['score'] == 50


def test_desk_cut_is_the_screens_percentile(monkeypatch):
    scored = [{'signal_id': str(i), 'score': float(i)} for i in range(1, 21)]
    out = desk(monkeypatch, scored, members=[])
    assert out['book_scores'][0] == 20.0 and len(out['book_scores']) == 20
    # top 30% of 20 scores = the 6 highest (20..15) -> cut 15
    assert out['runners']['cut'] == screen._percentile_cut(out['book_scores'], screen.RUNNERS_EDGE_TOP) == 15.0


def test_desk_without_a_book_says_so(monkeypatch):
    assert desk(monkeypatch, None, members=[]) == {'ok': False}


def members(monkeypatch, start, decided, live, before):
    monkeypatch.setattr(screen, '_runner_decisions', lambda db: (start, decided))
    monkeypatch.setattr(screen, 'live_runner_ids', lambda db: live)
    return screen.runner_members(DB([[(sid,) for sid in before]]))


def test_members_are_the_topic_decision_once_it_exists(monkeypatch):
    # 'posted' was chosen and has since slipped under the cut (not live now);
    # 'rejected' was turned down and now ranks in; 'fresh' is undecided. Only
    # the topic's yes counts — the rule re-run today decides nothing.
    out = members(monkeypatch, '2026-09-18 03:37:22+00',
                  decided={'posted': True, 'rejected': False},
                  live=['rejected', 'fresh'], before=[])
    assert out == ['posted']


def test_calls_from_before_the_topic_use_the_rule(monkeypatch):
    out = members(monkeypatch, '2026-09-18 03:37:22+00', decided={'posted': True},
                  live=['old', 'fresh'], before=['old'])
    assert out == ['old', 'posted']


def test_without_a_topic_the_rule_stands(monkeypatch):
    assert members(monkeypatch, None, decided={}, live=['b', 'a'], before=[]) == ['a', 'b']


def test_screen_runners_reads_members_and_adds_no_second_cut(monkeypatch):
    monkeypatch.setattr(screen, 'runner_members', lambda db: ['1', '3'])
    monkeypatch.setattr(screen, '_scored_book', lambda db: (_ for _ in ()).throw(AssertionError('no cut')))
    db = DB([[('1',), ('2',), ('3',)]])
    assert screen._evaluate_screen({'runners': True, 'risk_level': ['normal']}, db) == ['1', '3']
    assert ':risks' in db.queries[0][0] and ':runner_tags' not in db.queries[0][0]


def test_desk_top_runners_are_members_the_topic_marked(monkeypatch):
    scored = [{'signal_id': s, 'score': 50 + i} for i, s in enumerate(
        ['top', 'plain', 'gone', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7'])]
    # 'gone' was marked but is no longer a member of this book's Runners.
    out = desk(monkeypatch, scored, members=['top', 'plain'], top={'top', 'gone'})
    assert out['runners']['top_ids'] == ['top']
    assert out['runners']['edge_top'] == screen.RUNNERS_EDGE_TOP == 30
