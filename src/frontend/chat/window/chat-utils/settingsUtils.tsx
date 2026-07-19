import { Dispatch, SetStateAction } from "react";
import { getSettings, getModels } from "../../../api";
import type { UserSettings, ModelInfo } from "../../../types";


export function getSettingsLoaderFun(setUserSettings: Dispatch<SetStateAction<UserSettings>>, userSettings: UserSettings, setCurrentModel: Dispatch<SetStateAction<ModelInfo | null>>) {
  return () => {
    Promise.all([getSettings(), getModels()]).then(([s, m]) => {
      const settings = s as UserSettings;
      setUserSettings({ ...userSettings, ...settings });
      const allModels = ((m as { groups: { models: ModelInfo[]; }[]; }).groups || []).flatMap((g) => g.models);
      if (allModels.length > 0) {
        const found = settings.model_id ? allModels.find((model) => model.id === settings.model_id) : undefined;
        setCurrentModel(found || allModels[0]);
      }
    }).catch((err) => {
      console.log('Error loading settings and models: ', err);
    });
  };
}
