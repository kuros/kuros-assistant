import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ schema: 'kuros_manager', name: 'team_members' })
export class TeamMemberEntity {
  @PrimaryColumn({ type: 'uuid', name: 'team_id' })
  teamId!: string;

  @PrimaryColumn({ type: 'uuid', name: 'person_id' })
  personId!: string;
}
