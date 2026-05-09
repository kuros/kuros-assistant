export interface PersonDto {
  id: string;
  name: string;
  email: string | null;
  slackUserId: string | null;
  outlookAddress: string | null;
  role: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePersonRequest {
  name: string;
  email?: string | null;
  slackUserId?: string | null;
  outlookAddress?: string | null;
  role?: string | null;
}

export type UpdatePersonRequest = Partial<CreatePersonRequest>;

export interface TeamDto {
  id: string;
  name: string;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamRequest {
  name: string;
  memberIds: string[];
}

export interface UpdateTeamRequest {
  name?: string;
  memberIds?: string[];
}
