import unittest
from association import assess
class AssociationTest(unittest.TestCase):
    def worker(self):return {'id':'m-w','class':'worker','box':[.3,.2,.2,.6],'confidence':.9,'workerId':None}
    def test_generic_weights_unknown(self):
        findings=assess([self.worker()],['worker'],'m')
        self.assertTrue(all(f['assessment']=='unknown' for f in findings))
    def test_missing_is_only_proposal(self):
        findings=assess([self.worker()],['worker','helmet','vest'],'m')
        self.assertTrue(all(f['assessment']=='missing' for f in findings))
        self.assertTrue(all('verification' not in f for f in findings))
    def test_association(self):
        ds=[self.worker(),{'id':'m-h','class':'helmet','box':[.35,.22,.08,.05],'confidence':.9,'workerId':None}]
        findings=assess(ds,['worker','helmet','vest'],'m');self.assertEqual(findings[0]['assessment'],'present');self.assertEqual(ds[1]['workerId'],'m-w')
    def test_small_worker_unknown(self):
        w=self.worker();w['box']=[.3,.2,.04,.1]
        self.assertTrue(all(f['assessment']=='unknown' for f in assess([w],['worker','helmet','vest'],'m')))
    def test_occluded_workers_are_unknown(self):
        first=self.worker();second=self.worker();second['id']='m-w2';second['box']=[.31,.21,.2,.6]
        findings=assess([first,second],['helmet','vest'],'m')
        self.assertTrue(all(f['assessment']=='unknown' for f in findings))
    def test_negative_detector_output_remains_a_proposal(self):
        ds=[self.worker(),{'id':'m-n','class':'no-helmet','rawClass':'no-hardhat','box':[.34,.22,.08,.06],'confidence':.9,'workerId':None}]
        findings=assess(ds,['helmet','vest'],'m')
        helmet=findings[0]
        self.assertEqual(helmet['assessment'],'missing')
        self.assertIn('negativeCandidates',helmet['original'])
        self.assertNotIn('verification',helmet)
    def test_negative_head_candidate_uses_head_region_with_overlapping_workers(self):
        front=self.worker();front['id']='front';front['box']=[.10,.35,.20,.60]
        behind=self.worker();behind['id']='behind';behind['box']=[.05,.02,.40,.70]
        negative={'id':'negative','class':'no-helmet','box':[.13,.36,.10,.10],'confidence':.9,'workerId':None}
        assess([front,behind,negative],['helmet','vest'],'m')
        self.assertEqual(negative['workerId'],'front')
if __name__=='__main__':unittest.main()
