import { Module, Global } from '@nestjs/common';
import { WorkerPoolService } from './worker-pool.service';
import { ProfileAnalysisService } from './profile-analysis.service';

@Global()
@Module({
  providers: [WorkerPoolService, ProfileAnalysisService],
  exports: [WorkerPoolService, ProfileAnalysisService],
})
export class WorkersModule {}
