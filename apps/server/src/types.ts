export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

declare global {
  // Express publishes this namespace so an app can add fields to Request.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}
