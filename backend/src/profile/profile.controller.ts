import { Controller, Get } from '@nestjs/common';
import { ProfileService } from './profile.service';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('latest')
  getLatestProfiles() {
    const profiles = this.profileService.getLatestProfiles();
    const result: { [key: string]: object } = {};
    profiles.forEach((profile, id) => {
      result[String(id)] = profile;
    });
    return {
      success: true,
      data: {
        profiles: result,
        frameCount: this.profileService.getFrameCount(),
      },
    };
  }

  @Get('status')
  getStatus() {
    return {
      success: true,
      data: {
        frameCount: this.profileService.getFrameCount(),
        sensorCount: this.profileService.getLatestProfiles().size,
        timestamp: Date.now(),
      },
    };
  }
}
