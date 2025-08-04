declare module "rage-edit" {
  export class Registry {
      static set(path: string, name: string, value: string): Promise<void>
  }
}