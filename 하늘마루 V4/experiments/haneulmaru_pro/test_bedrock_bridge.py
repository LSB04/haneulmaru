import unittest,json,threading,urllib.request,urllib.error
from unittest.mock import patch
import bedrock_bridge as ai
import stream_server as app
from http.server import ThreadingHTTPServer

class BedrockTests(unittest.TestCase):
 def tearDown(self): ai.credential('')
 def test_rejects_unbounded_or_executable_settings(self):
  for item in ({'count':201},{'count':True},{'quality':[]},{'speed':float('nan')},{'top':1},{'script':'alert(1)'}):
   with self.subTest(item=item),self.assertRaises(ValueError):ai.validate_scene(item)
 def test_mock_scene_and_usage(self):
  with patch.object(ai,'converse',return_value=('{"settings":{"count":80,"top":true},"explanation":"설정"}',{'inputTokens':12})):
   result=ai.request({'kind':'scene','prompt':'80개 2D'})
   self.assertEqual(result['settings'],{'count':80,'top':True})
   self.assertEqual(result['usage']['inputTokens'],12)
 def test_missing_credentials_no_network(self):
  with patch('urllib.request.urlopen') as call:
   with self.assertRaises(ValueError):ai.request({'kind':'scene','prompt':'50개'})
   call.assert_not_called()
 def test_metrics_discard_private_fields(self):
  self.assertEqual(ai.metrics_only({'meanFps':60,'token':'secret','camera':'data','p95FrameMs':float('inf')}),{'meanFps':60})
 def test_converse_model_headers_and_error_redaction(self):
  ai.credential('TEST-ONLY-KEY')
  with patch('urllib.request.urlopen',side_effect=urllib.error.HTTPError('ignored',403,'TEST-ONLY-KEY',{},None)) as call:
   with self.assertRaises(ValueError) as caught:ai.converse('system','hello')
   self.assertNotIn('TEST-ONLY-KEY',str(caught.exception))
   request=call.call_args.args[0]
   self.assertIn('/model/us.anthropic.claude-sonnet-4-6/converse',request.full_url)
   self.assertEqual(json.loads(request.data)['inferenceConfig']['maxTokens'],900)

class APITests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.http=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);app.PORT=cls.http.server_port
  cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
 @classmethod
 def tearDownClass(cls):cls.http.shutdown();cls.http.server_close();cls.thread.join()
 def call(self,token,path,body=None,extra=None):
  req=urllib.request.Request('http://127.0.0.1:'+str(app.PORT)+'/stream/'+path,
   data=json.dumps(body).encode() if body is not None else None,
   headers={'Authorization':'Bearer '+token,'Content-Type':'application/json',**(extra or {})})
  try:
   with urllib.request.urlopen(req) as r:return r.status,json.load(r)
  except urllib.error.HTTPError as e:return e.code,json.load(e)
 def test_phone_cannot_configure_or_invoke_aws(self):
  for path in ('ai/credential','ai/request'):
   self.assertEqual(self.call(app.PHONE,path,{'token':'TEST'})[0],403)
 def test_tunnel_and_cross_origin_rejected(self):
  for headers in ({'Host':'test.trycloudflare.com'},{'CF-Ray':'abc'},{'Origin':'https://other.example'}):
   self.assertEqual(self.call(app.HOST,'ai/credential',{'token':'TEST'},headers)[0],403)
 def test_local_credentials_redacted_and_clearable(self):
  code,response=self.call(app.HOST,'ai/credential',{'token':'TEST-ONLY-KEY'})
  self.assertEqual(code,200);self.assertTrue(response['configured']);self.assertNotIn('TEST-ONLY',json.dumps(response))
  self.call(app.HOST,'ai/credential',{'token':''})
  self.assertFalse(self.call(app.HOST,'ai/status')[1]['configured'])
 def test_anonymous_rejected(self):self.assertEqual(self.call('invalid','ai/status')[0],401)
 def test_host_session_recovery_local_only(self):
  code,data=self.call('stale','host-session')
  self.assertEqual(code,200);self.assertEqual(data,{'key':app.HOST})
  self.assertEqual(self.call(data['key'],'ai/status')[0],200)
  for headers in ({'Host':'public.trycloudflare.com'},{'CF-Ray':'abc'},{'X-Forwarded-Host':'other'}, {'Origin':'https://other.example'},{'Sec-Fetch-Site':'cross-site'}):
   with self.subTest(headers=headers):self.assertEqual(self.call('stale','host-session',extra=headers)[0],403)

if __name__=='__main__':unittest.main()
