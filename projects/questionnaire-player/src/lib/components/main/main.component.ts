import {
  AfterViewInit,
  Component,
  Input,
  OnInit,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { Question, ResponseType, DisplayType, ApiConfiguration } from '../../interfaces/questionnaire.type';
import { FormBuilder, FormGroup } from '@angular/forms';
import { DialogComponent } from '../dialog/dialog.component';
import { QuestionnaireService } from '../../services/questionnaire.service';

@Component({
  selector: 'lib-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss'],
})
export class MainComponent implements OnInit, AfterViewInit {
  @Input({ required: true }) questions: Array<Question>;
  @Input() isSubmitted: boolean;
  @Input({ required: true }) questionnaireForm: FormGroup;
  @ViewChild('dialogCmp') childDialogComponent: DialogComponent;
  @Input() questionnaireInstance = false;
  @Input() fileUploadResponse;
  @Input() fileSizeLimit;
  @Input() apiConfig: ApiConfiguration;
  @ViewChild('questionnaire') questionnaire:TemplateRef<any>;
  selectedIndex: number;
  dimmerIndex;
  isDimmed;
  hintModalNote:string
  @Input() isExpired:boolean;

  pageSize = 1; 
  pageIndex = 0;
  hidePageSize = true;
  showFirstLastButtons = true;
  disabled = false;
  paginatorLength: number;
  enablePagination: boolean = true; // Default to true for backward compatibility

  constructor(public fb: FormBuilder, public qService: QuestionnaireService) {}

  public get reponseType(): typeof ResponseType {
    return ResponseType;
  }

  public get displayType(): typeof DisplayType {
    return DisplayType;
  }

  public get displayTypeArray(): string[] {
    return Object.values(DisplayType);
  }

  ngOnInit(): void {
    // Check if pagination is enabled (default to true for backward compatibility)
    this.enablePagination = this.apiConfig?.enablePagination !== false;
    this.paginatorLength = this.questions.length;
  }

  ngAfterViewInit(): void {
    // Only enable pagination logic if pagination is enabled
    if (this.enablePagination) {
      setTimeout(() => {
        this.enableRelevantPage();
      });
    }
  }
  
  enableRelevantPage(questionId?){
    window.scrollTo(0, 0);

    if(!this.questionnaireInstance && this.enablePagination){
      for(let i = 0; i < this.questions.length; i++){
        if(i !== this.pageIndex){
          this.domQuery(i,'none');
        }
      }
      this.domQuery(this.pageIndex,'block',questionId);
    }
  }

  domQuery(elemendId:number,action:string,questionId?:string){
    if(document.getElementById(`${elemendId}`)){
      document.getElementById(`${elemendId}`).style.display = action;
    }
    if(questionId && document.getElementById(`${questionId}`)){
      window.setTimeout(() => {
        document.getElementById(`${questionId}`).focus();
      },500)
    }
  }

  handlePageEvent(e) {
    this.pageIndex = e.pageIndex;
    if (this.questions[e.pageIndex] && !this.findNextVisibleQuestion(e.pageIndex, this.pageIndex)) {
      this.paginatorLength = this.pageIndex +1;
    }
      this.enableRelevantPage(e?.questonId);
  }

  private findNextVisibleQuestion(eventPageIndex: number, currentPageIndex: number): boolean {
    let step = 1;
    let endIndex = this.questions.length;
    if (currentPageIndex > eventPageIndex) {
      endIndex = 0;
      step = -1;
    }
    for (let i = eventPageIndex; this.questions[i]; i += step) {
      if (Array.isArray(this.questions[i].visibleIf) && this.questions[i].canDisplay
        || !Array.isArray(this.questions[i].visibleIf)) {
        this.pageIndex = i;
        return true;
      }
    }
    return false;
  }

  questionTrackBy(index, question) {
    return question._id;
  }

  openDialog(hint) {
    this.isDimmed = !this.isDimmed;
    this.childDialogComponent.hint = hint;
    this.childDialogComponent.hintModalNote = "Note: This is the hint for the following question";
    this.childDialogComponent?.openDialog('300ms', '150ms');
  }

  toggleQuestion(parent) {
    const { children } = parent;
    this.questions.map((q, i) => {
      if (children.includes(q._id)) {
        let child = this.questions[i];
        child['canDisplay'] = this.canDisplayChildQ(child, i);
        if (child['canDisplay'] == false) {
          child.value = '';
          this.questionnaireForm.removeControl(child._id);
        }
      }
    });
    if(!this.questionnaireInstance && this.enablePagination){
      if(!this.findNextVisibleQuestion(this.pageIndex,this.questions.length)){
        this.paginatorLength = this.pageIndex + 1;
      }else{
        this.paginatorLength = this.questions.length;
      }
    }
   
  }

  canDisplayChildQ(currentQuestion: Question, currentQuestionIndex: number) {
    let display = true;
    if (typeof currentQuestion.visibleIf == 'string' || null || undefined) {
      return false; //if condition not present
    }
    for (const question of this.questions) {
      for (const condition of currentQuestion.visibleIf) {
        if (condition._id === question._id) {
          let expression = [];
          const conditionValues = this.parseConditionValue(condition.value);
          // Normalize operator - handle case where operator might be "OR" instead of "||"
          const normalizedOperator = condition.operator === 'OR' || condition.operator === 'or' ? '||' : condition.operator;
          if (normalizedOperator != '===') {
            if (question.responseType === 'multiselect') {
              if (Array.isArray(question.value) && question.value.length > 0) {
                for (const parentValue of question.value) {
                  for (const value of conditionValues) {
                    expression.push(
                      '(',
                      "'" + String(parentValue || '') + "'",
                      '===',
                      "'" + String(value || '') + "'",
                      ')',
                      normalizedOperator
                    );
                  }
                }
              }
            } else {
              const qValue = question.value !== null && question.value !== undefined ? String(question.value) : '';
              for (const value of conditionValues) {
                expression.push(
                  '(',
                  "'" + qValue + "'",
                  '===',
                  "'" + String(value || '') + "'",
                  ')',
                  normalizedOperator
                );
              }
            }
            if (expression.length > 0) {
              expression.pop(); // Remove last operator
            }
          } else {
            // Handle === operator with OR logic for comma-separated values
            if (question.responseType === 'multiselect') {
              // For multiselect, check if any question value matches any condition value
              if (Array.isArray(question.value) && question.value.length > 0) {
                for (const qValue of question.value) {
                  for (const condValue of conditionValues) {
                    expression.push(
                      '(',
                      "'" + String(qValue || '') + "'",
                      '===',
                      "'" + String(condValue || '') + "'",
                      ')',
                      '||'
                    );
                  }
                }
                if (expression.length > 0) {
                  expression.pop(); // Remove last '||'
                }
              }
            } else {
              // For single value, check if question value matches any condition value (OR logic)
              const questionValue = question.value !== null && question.value !== undefined ? String(question.value) : '';
              for (const condValue of conditionValues) {
                expression.push(
                  '(',
                  "'" + questionValue + "'",
                  '===',
                  "'" + String(condValue || '') + "'",
                  ')',
                  '||'
                );
              }
              if (expression.length > 0) {
                expression.pop(); // Remove last '||'
              }
            }
          }
          if (!eval(expression.join(''))) {
            this.questions[currentQuestionIndex].isCompleted = true;
            return false;
          } else {
            // this.questions[currentQuestionIndex].isCompleted =
            //   this.utils.isQuestionComplete(currentQuestion);
          }
        }
      }
    }
    return display;
  }

  closeHint() {
    this.isDimmed = false;
  }

  parseConditionValue(val: string | string[]): string[] {
    if (Array.isArray(val)) {
      return val.filter(v => v !== null && v !== undefined).map(v => String(v));
    }
    if (typeof val === 'string') {
      if (val.includes(',')) {
        return val.split(',').map(v => v.trim()).filter(v => v !== '');
      }
    }
    return [];
  }
}
