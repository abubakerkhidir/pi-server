import { Dispatch, SetStateAction } from "react";
import { getSettings, getModels } from "../../../api";
import type { UserSettings, ModelInfo, ModelProvider } from "../../../types";


export function getSettingsLoaderFun(setUserSettings: Dispatch<SetStateAction<UserSettings>>, userSettings: UserSettings, setCurrentModel: Dispatch<SetStateAction<ModelInfo | null>>) {
  return () => {
    Promise.all([getSettings(), getModels()]).then(([s, m]) => {
      const settings = s as UserSettings;
      const providers = (m as { groups: ModelProvider[]; }).groups;
      setUserSettings({ ...userSettings, ...settings, providers });
    }).catch((err) => {
      console.log('Error loading settings and models: ', err);
    });
  };
}
