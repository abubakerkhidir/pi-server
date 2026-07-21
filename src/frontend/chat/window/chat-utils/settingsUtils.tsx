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
        let found;
        if (settings.model_id) {
          const [provider, ...rest] = settings.model_id.split("/");
          const modelId = rest.join("/");
          found = allModels.find((model) => model.provider === provider && model.id === modelId);
        }
        setCurrentModel(found || allModels[0]);
      }
    }).catch((err) => {
      console.log('Error loading settings and models: ', err);
    });
  };
}
