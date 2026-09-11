import pytest
from fastapi import HTTPException
from app.services.custom_signal_rules import validate_rules, rule_conditions, evaluate_rules
from app.api.routes.signal_alert_filters import _clean_criteria


def rule(field='btc_rho', op='gte', value=0.6):
    return dict(field=field, op=op, value=value)

@pytest.mark.parametrize('rules', [[],[rule(value='0.6')],[rule(value=True)],[rule(value=float('nan'))],[rule(value=1.1)], [rule(op='between',value=[0.8,0.2])],[rule(op='between',value=[0.2])], [rule(field='confidence')],[rule(),rule()], [rule(field='btc_samples',value=1.5)], [rule(field='risk',op='in',value=[])], [rule(field='btc_confidence',op='in',value=['A'])]])
def test_invalid_rules_fail_explicitly(rules):
    with pytest.raises(HTTPException) as error:
        validate_rules(rules)
    assert error.value.status_code == 422


def test_zero_negative_and_custom_bounds_are_preserved():
    rules=[rule(value=0),rule('btc_beta','between',[-0.8,1.2]),rule('sl_distance','lte',2.5)]
    assert validate_rules(rules)==rules
    _,_,params=rule_conditions(rules)
    assert params=={'rule_0':0,'rule_1':-0.8,'rule_1_max':1.2,'rule_2':2.5}


def test_exclusions_and_false_require_available_data():
    where,known,_=rule_conditions([rule('btc_decoupled','eq',False),rule('tags','none',['SMC_GOLDEN_SETUP'])])
    assert all('IS NOT NULL' in w for w in where)
    assert 'insufficient_data' in known[0]
    assert "important" in where[1]
    assert '= 0' in where[1]


def test_do_not_silently_mix_versions():
    with pytest.raises(HTTPException):
        _clean_criteria({'rules_v2':[rule()],'runners':True})
    assert _clean_criteria({'rules_v2':[rule()]})=={'rules_v2':[rule()]}


def test_pair_filter_does_not_require_enrichment_and_counts_unknowns():
    class Result:
        def fetchall(self): return [('a',True,True),('b',False,True),('c',False,False)]
    class DB:
        def execute(self,sql,params):
            assert 'LEFT JOIN signal_enrichment' in str(sql)
            assert params['rule_0']==['BTCUSDT']
            return Result()
    assert evaluate_rules([rule('pair','in',['BTCUSDT'])],DB())=={'signal_ids':['a'],'total':3,'unavailable':1}
