#!/usr/bin/env python3
import json, os, time, urllib.request, urllib.error
BASE=os.environ.get('BASE','http://127.0.0.1:8787')
def req(path,method='GET',body=None,token=None,mutation_id=None):
    data=None if body is None else json.dumps(body).encode();h={'Content-Type':'application/json'}
    if token:h['Authorization']='Bearer '+token
    if mutation_id:h['X-Moonjang-Mutation-Id']=mutation_id
    r=urllib.request.Request(BASE+path,data=data,headers=h,method=method)
    with urllib.request.urlopen(r,timeout=5) as x:return x.status,json.load(x)
def main():
    assert req('/health')[1]['ok']
    stamp=str(int(time.time()*1000))[-9:]
    _,a=req('/v1/auth/anonymous','POST',{'handle':'alpha_'+stamp,'penName':'알파'});ta=a['token']
    _,b=req('/v1/auth/anonymous','POST',{'handle':'beta_'+stamp,'penName':'베타'});tb=b['token']
    create_mid='post-create-'+stamp
    create_body={'type':'sentence','content':'실제 SQLite에 저장되는 테스트 문장입니다.','topics':['테스트','기록'],'visibility':'public'}
    _,created=req('/v1/posts','POST',create_body,ta,create_mid);pid=created['post']['id']
    _,created_replay=req('/v1/posts','POST',create_body,ta,create_mid);assert created_replay['post']['id']==pid
    _,private=req('/v1/posts','POST',{'type':'sentence','content':'나만 보는 문장입니다.','topics':['개인'],'visibility':'private'},ta);private_id=private['post']['id']
    _,created2=req('/v1/posts','POST',{'type':'sentence','content':'두 번째 공개 문장입니다.','topics':['테스트'],'visibility':'public'},ta);pid2=created2['post']['id']
    try:
        req('/v1/posts','POST',{'type':'sentence','content':'두 번째 공개 문장입니다.','topics':['테스트'],'visibility':'public'},ta);raise AssertionError('duplicate post should fail')
    except urllib.error.HTTPError as e:
        assert e.code==409
    _,feed=req('/v1/feed',token=tb);assert any(p['id']==pid for p in feed['items']);assert all(p['id']!=private_id for p in feed['items'])
    for route,method,payload in [(f'/v1/posts/{private_id}','GET',None),(f'/v1/posts/{private_id}/collect','POST',{}),(f'/v1/posts/{private_id}/comments','POST',{'content':'보이면 안 됨'})]:
        try:
            req(route,method,payload,tb);raise AssertionError('private post leaked')
        except urllib.error.HTTPError as e:
            assert e.code==404
    collect_mid='collect-'+stamp
    assert req('/v1/posts/'+pid+'/collect','POST',{},tb,collect_mid)[1]['collected'] is True
    assert req('/v1/posts/'+pid+'/collect','POST',{},tb,collect_mid)[1]['collected'] is True
    assert req('/v1/writers/'+a['user']['id']+'/follow','POST',{},tb)[1]['following'] is True
    _,com=req('/v1/posts/'+pid+'/comments','POST',{'content':'오래 남을 문장이네요.'},tb);assert com['comment']['content']
    _,detail=req('/v1/posts/'+pid,token=ta);assert len(detail['comments'])==1
    req('/v1/events','POST',{'kind':'open','postId':pid},tb);req('/v1/events','POST',{'kind':'open','postId':pid},tb);req('/v1/events','POST',{'kind':'open','postId':pid2},tb)
    _,ins=req('/v1/insights',token=ta);assert ins['collections']>=1;assert ins['crossReads']>=1
    _,search=req('/v1/search?q=SQLite',token=ta);assert any(p['id']==pid for p in search['posts'])
    req('/v1/drafts','PUT',{'type':'sentence','content':'자동 저장 초안'},ta);assert req('/v1/drafts',token=ta)[1]['content']=='자동 저장 초안'
    _,pub=req('/v1/collections','POST',{'title':'공개 테스트 서랍','description':'공개 큐레이션','visibility':'public'},tb);assert pub['collection']['visibility']=='public'
    _,alpha_pub=req('/v1/collections','POST',{'title':'알파 공개 서랍','description':'비공개 글은 노출 금지','visibility':'public'},ta)
    req(f"/v1/collections/{alpha_pub['collection']['id']}/items",'POST',{'postId':private_id},ta)
    _,view_alpha_pub=req(f"/v1/collections/{alpha_pub['collection']['id']}",token=tb);assert all(p['id']!=private_id for p in view_alpha_pub['collection']['items'])
    _,cols=req('/v1/collections',token=tb);assert cols['items']
    _,disc=req('/v1/discover',token=ta);assert any(c['id']==pub['collection']['id'] for c in disc['publicCollections'])
    report_mid='report-'+stamp
    assert req('/v1/reports','POST',{'postId':pid,'reason':'테스트 신고'},tb,report_mid)[1]['ok']
    assert req('/v1/reports','POST',{'postId':pid,'reason':'테스트 신고'},tb,report_mid)[1]['ok']
    assert req('/v1/me','DELETE',None,tb)[1]['ok'] is True
    try:
        req('/v1/me',token=tb);raise AssertionError('deleted session should fail')
    except urllib.error.HTTPError as e:
        assert e.code==401
    print('SMOKE_OK')
if __name__=='__main__':main()
